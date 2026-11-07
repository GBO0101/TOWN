/* 自研沿用座位工作；啟動與營運支出仍由公司唯一付款程序支付。 */
const PassiveProducts = (() => {
    const costs = product => Object.fromEntries(Object.entries(product.dailyCosts).map(([category, fixed]) =>
        [category, Math.round(fixed + (product.costPerCustomer?.[category] || 0) * (product.customers || 0))]));
    const dailyCost = product => Object.values(costs(product)).reduce((sum, amount) => sum + amount, 0);
    const monthlyCosts = () => sim.products.filter(product => product.phase === 'live')
        .reduce((sum, product) => sum + dailyCost(product), 0) * ECONOMY.daysPerMonth;

    function canWork(project) {
        if (project.maintenance) return true;
        if (!sim.projects.some(item => item.source !== 'product' && item.type === project.type)) return true;
        return project.workDay !== sim.day || project.workToday < projectDailyCapacity(project.type, false) * PRODUCT_POLICY.workShare;
    }

    function salesTarget() {
        const profitable = product => product.customers * product.revenuePerCustomer >= dailyCost(product);
        return sim.products.filter(product => product.phase === 'live').sort((a, b) =>
            Number(profitable(a)) - Number(profitable(b)) || (a.lastProspectedDay || 0) - (b.lastProspectedDay || 0) || a.launchedDay - b.launchedDay)[0];
    }

    function acquireCustomers(product, sales, won) {
        if (!won || product.phase !== 'live' || !sim.products.includes(product)) {
            officeEvent('product_sale_failed', `${sales.name}開發「${product.name}」客戶未成交，或產品已停止營運`, [sales]);
            return false;
        }
        const [minimum, maximum] = product.customersPerVisit;
        const customers = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
        product.customers += customers;
        product.lastSale = {day: sim.day, salesId: sales.id, customers};
        officeEvent('product_customers', `${sales.name}完成「${product.name}」獲客活動，新增 ${customers} 位付費客戶，現有 ${product.customers} 位`, [sales]);
        return true;
    }

    function scheduleMaintenance(product) {
        const [minimum, maximum] = PRODUCT_POLICY.maintenance.intervalDays;
        product.nextMaintenanceDay = sim.day + minimum + Math.floor(Math.random() * (maximum - minimum + 1));
    }

    function cancelMaintenance(product) {
        const project = sim.projects.find(item => item.maintenance && item.productId === product.id);
        if (!project) return;
        project.status = 'cancelled';
        sim.projects = sim.projects.filter(item => item !== project);
        finishProjectWork(project);
        sim._projectUpdated = true;
        officeEvent('product_maintenance_cancelled', `「${project.name}」因產品停運取消，釋放原維護人力`);
    }

    function maintain(hour) {
        for (const product of sim.products) {
            if (product.phase !== 'live') { cancelMaintenance(product); continue; }
            if (hour < 9 || hour >= 17.5 || sim.day < product.nextMaintenanceDay ||
                sim.projects.some(project => project.maintenance && project.productId === product.id)) continue;
            startNewProject({id: `maintenance_${product.id}_${sim.nextProjectId + 1}`, productId: product.id,
                source: 'product', maintenance: true, name: `${product.name}維護`, type: product.type, work: product.maintenanceWork, reward: 0}, null);
        }
    }

    function review(hour) {
        if (hour < 9 || hour >= 17 || sim._lastProductReviewDay === sim.day ||
            !sim.characters.some(ch => ch.id === 'boss' && ch.employment !== 'departed' && ch.isPresent)) return;
        sim._lastProductReviewDay = sim.day;
        for (const product of sim.products) {
            if (product.phase !== 'live' || product.lossDays < ECONOMY.daysPerMonth || sim.day - product.launchedDay < PRODUCT_POLICY.customerGraceDays) continue;
            product.phase = 'stopped'; product.stoppedDay = sim.day; product.stopReason = '連續一個月營運虧損';
            cancelMaintenance(product);
            sim.productDecision = `停止「${product.name}」，避免持續支付虧損的營運費用`;
            officeEvent('product_stopped', sim.productDecision);
        }
        if (sim.day < sim._nextProductDay) return;
        if (sim.products.some(product => product.phase === 'developing')) { sim.productDecision = '先完成現有自研開發'; return; }
        if (sim.products.filter(product => product.phase !== 'stopped').length >= PRODUCT_POLICY.maxOperating) return;
        const candidate = PRODUCT_CATALOG.find(item => !sim.products.some(product => product.catalogId === item.id));
        if (!candidate || !projectDailyCapacity(candidate.type)) { sim.productDecision = '暫無適合的自研項目或開發人力'; return; }
        const earliestDay = candidate.minDay ?? PRODUCT_POLICY.startDay;
        if (sim.day < earliestDay) { sim.productDecision = `「${candidate.name}」屬後期投資，最早第 ${earliestDay} 天評估，啟動費 $${candidate.initialCost.toLocaleString()}`; return; }
        const backlog = sim.projects.filter(project => project.type === candidate.type).reduce((sum, project) => sum + project.work - project.workDone, 0);
        if (backlog / projectDailyCapacity(candidate.type) > STAFFING.targetBacklogDays) { sim.productDecision = '優先交付現有合約，暫緩自研'; return; }
        const reserve = (CompanyFinance.monthlyBurn() + dailyCost(candidate) * ECONOMY.daysPerMonth) * PRODUCT_POLICY.reserveMonths;
        if (CompanyFinance.available() - CompanyFinance.summary().advances < candidate.initialCost + reserve) {
            sim.productDecision = '自研資金尚未備妥：需保留啟動費與三個月營運準備'; return;
        }
        const id = `product_${sim.products.length + 1}`;
        const project = startNewProject({id, productId: id, source: 'product', name: candidate.name, type: candidate.type, work: candidate.work, reward: 0}, null);
        if (!project) return;
        sim.products.push({...candidate, id, catalogId: candidate.id, phase: 'developing', projectId: project.id,
            startedDay: sim.day, customers: 0, invested: candidate.initialCost, totalRevenue: 0, totalOperatingCost: 0, lastSettlementDay: 0, lossDays: 0});
        CompanyFinance.charge(candidate.initialCost, '自研啟動', {productId: id});
        sim._nextProductDay = sim.day + PRODUCT_POLICY.cooldownDays;
        sim.productDecision = `投入 $${candidate.initialCost.toLocaleString()} 開發「${candidate.name}」`;
    }

    function complete(project) {
        const product = sim.products.find(item => item.id === project.productId && item.phase === (project.maintenance ? 'live' : 'developing'));
        if (!product) return;
        scheduleMaintenance(product);
        sim.projects = sim.projects.filter(item => item !== project);
        finishProjectWork(project);
        sim._projectUpdated = true;
        if (project.maintenance) {
            officeEvent('product_maintenance_done', `「${project.name}」完成，無額外收入，停止本次維護延誤造成的客戶流失`);
            return;
        }
        product.phase = 'live'; product.launchedDay = sim.day;
        officeEvent('product_launched', `自研「${product.name}」上線，目前沒有付費客戶，需由業務開發；次營業日起負擔固定營運成本`);
    }

    function settleDay() {
        for (const product of sim.products) {
            if (product.phase !== 'live' || sim.day <= product.launchedDay || product.lastSettlementDay === sim.day) continue;
            product.lastSettlementDay = sim.day;
            const maintenance = sim.projects.find(project => project.maintenance && project.productId === product.id);
            if (maintenance && sim.day > maintenance.deadlineDay) {
                const lost = Math.min(product.customers, Math.ceil(product.customers * PRODUCT_POLICY.maintenance.dailyChurn));
                product.customers -= lost;
                maintenance.lostCustomers = (maintenance.lostCustomers || 0) + lost;
                if (lost) officeEvent('product_churn', `「${product.name}」維護逾期，流失 ${lost} 位付費客戶，剩餘 ${product.customers} 位`);
            }
            const revenue = Math.round(product.customers * product.revenuePerCustomer);
            const cost = dailyCost(product);
            CompanyFinance.recognizeRevenue(revenue, 'products');
            CompanyFinance.receive(revenue);
            for (const [category, amount] of Object.entries(costs(product))) CompanyFinance.charge(amount, category, {productId: product.id});
            product.totalRevenue += revenue; product.totalOperatingCost += cost;
            product.lastIncome = {day: sim.day, customers: product.customers, revenue, cost, profit: revenue - cost};
            product.lossDays = revenue < cost ? product.lossDays + 1 : 0;
            officeEvent('product_income', `「${product.name}」付費客戶 ${product.customers} 位，收入 $${revenue.toLocaleString()}、營運成本 $${cost.toLocaleString()}，本日營運損益 $${(revenue - cost).toLocaleString()}`);
        }
    }

    return {review, dailyCost, monthlyCosts, complete, settleDay, canWork, costs, salesTarget, acquireCustomers, maintain};
})();
