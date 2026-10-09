/**
 * Finans Pro - Ek Modüller
 * Borçlar, Yatırımlar, Faturalar, Notlar, Raporlar
 */

// ============================================
// DEBT MANAGER
// ============================================
const DebtManager = {
    async add(data) {
        const debt = {
            id: Utils.generateId(),
            profileId: AppState.currentProfile.id,
            type: data.type, // 'borrowed' or 'lent'
            person: data.person,
            amount: parseFloat(data.amount),
            remainingAmount: parseFloat(data.amount),
            interestRate: parseFloat(data.interestRate) || 0,
            dueDate: data.dueDate,
            description: data.description || '',
            isPaid: false,
            payments: [],
            createdAt: new Date().toISOString()
        };
        
        await DBManager.add('debts', debt);
        AppState.debts.push(debt);
        
        Utils.showToast(data.type === 'borrowed' ? 'Borç eklendi' : 'Alacak eklendi', 'success');
        DataManager.updateBadges();
        
        return debt;
    },
    
    async addPayment(debtId, amount) {
        const debt = AppState.debts.find(d => d.id === debtId);
        if (!debt) return null;

        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0 || value > debt.remainingAmount) {
            throw new Error('Ödeme tutarı sıfırdan büyük ve kalan borçtan küçük veya eşit olmalı.');
        }
        
        const payment = {
            id: Utils.generateId(),
            amount: parseFloat(amount),
            date: new Date().toISOString()
        };
        
        const updated = { ...debt, payments: [...(debt.payments || []), payment], remainingAmount: Math.round((debt.remainingAmount - value) * 100) / 100 };
        
        if (updated.remainingAmount <= 0) {
            updated.isPaid = true;
            updated.remainingAmount = 0;
        }
        
        await DBManager.put('debts', updated);
        Object.assign(debt, updated);
        Utils.showToast('Ödeme kaydedildi', 'success');
        DataManager.updateBadges();
        
        return debt;
    },
    
    async delete(debtId) {
        await DBManager.delete('debts', debtId);
        AppState.debts = AppState.debts.filter(d => d.id !== debtId);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('debts', debtId);
        }
        Utils.showToast('Borç silindi', 'success');
        DataManager.updateBadges();
    },
    
    getTotalBorrowed() {
        return AppState.debts
            .filter(d => d.type === 'borrowed' && !d.isPaid)
            .reduce((sum, d) => sum + d.remainingAmount, 0);
    },
    
    getTotalLent() {
        return AppState.debts
            .filter(d => d.type === 'lent' && !d.isPaid)
            .reduce((sum, d) => sum + d.remainingAmount, 0);
    }
};

// ============================================
// INVESTMENT MANAGER
// ============================================
const InvestmentManager = {
    // Asset types
    types: {
        currency: { name: 'Döviz', icon: 'bi:currency-exchange' },
        stock: { name: 'Hisse Senedi', icon: 'bi:graph-up' },
        crypto: { name: 'Kripto Para', icon: 'bi:currency-bitcoin' },
        bond: { name: 'Tahvil/Bono', icon: 'bi:file-earmark-text' },
        gold: { name: 'Altın', icon: 'bi:coin' },
        realestate: { name: 'Gayrimenkul', icon: 'bi:house' },
        vehicle: { name: 'Araç', icon: 'bi:car-front' },
        other: { name: 'Diğer', icon: 'bi:gem' }
    },
    
    async add(data) {
        const investment = {
            id: Utils.generateId(),
            profileId: AppState.currentProfile.id,
            type: data.type,
            name: data.name,
            symbol: data.symbol || '',
            quantity: parseFloat(data.quantity) || 1,
            purchasePrice: parseFloat(data.purchasePrice),
            currentPrice: parseFloat(data.currentPrice) || parseFloat(data.purchasePrice),
            purchaseDate: data.purchaseDate,
            notes: data.notes || '',
            createdAt: new Date().toISOString()
        };
        
        await DBManager.add('investments', investment);
        AppState.investments.push(investment);
        
        Utils.showToast('Varlık eklendi', 'success');
        return investment;
    },
    
    async updatePrice(investmentId, newPrice) {
        const investment = AppState.investments.find(i => i.id === investmentId);
        if (!investment) return null;
        
        investment.currentPrice = parseFloat(newPrice);
        investment.updatedAt = new Date().toISOString();
        
        await DBManager.put('investments', investment);
        return investment;
    },
    
    async delete(investmentId) {
        await DBManager.delete('investments', investmentId);
        AppState.investments = AppState.investments.filter(i => i.id !== investmentId);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('investments', investmentId);
        }
        Utils.showToast('Varlık silindi', 'success');
    },
    
    calculateReturn(investment) {
        const totalCost = investment.purchasePrice * investment.quantity;
        const currentValue = investment.currentPrice * investment.quantity;
        const profit = currentValue - totalCost;
        const percentage = totalCost > 0 ? (profit / totalCost) * 100 : 0;
        
        return {
            totalCost,
            currentValue,
            profit,
            percentage
        };
    },
    
    getTotalValue() {
        return AppState.investments.reduce((sum, inv) => {
            return sum + (inv.currentPrice * inv.quantity);
        }, 0);
    },
    
    getTotalProfit() {
        return AppState.investments.reduce((sum, inv) => {
            const { profit } = this.calculateReturn(inv);
            return sum + profit;
        }, 0);
    },
    
    getPortfolioDistribution() {
        const total = this.getTotalValue();
        const distribution = {};
        
        AppState.investments.forEach(inv => {
            const value = inv.currentPrice * inv.quantity;
            const type = inv.type;
            
            if (!distribution[type]) {
                distribution[type] = {
                    type: this.types[type],
                    value: 0,
                    percentage: 0
                };
            }
            
            distribution[type].value += value;
        });
        
        // Calculate percentages
        Object.keys(distribution).forEach(type => {
            distribution[type].percentage = total > 0 
                ? (distribution[type].value / total) * 100 
                : 0;
        });
        
        return Object.values(distribution);
    },
    
    // Simüle satış
    simulateSale(investmentId) {
        const investment = AppState.investments.find(i => i.id === investmentId);
        if (!investment) return null;
        
        const { currentValue, profit, percentage } = this.calculateReturn(investment);
        
        return {
            investment,
            saleValue: currentValue,
            profit,
            profitPercentage: percentage,
            impact: {
                newTotalAssets: this.getTotalValue() - currentValue + currentValue, // Cash
                portfolioChange: -((currentValue / this.getTotalValue()) * 100)
            }
        };
    }
};

// ============================================
// BILL MANAGER
// ============================================
const BillManager = {
    frequencies: {
        monthly: { name: 'Her Ay', days: 30 },
        bimonthly: { name: '2 Ayda Bir', days: 60 },
        quarterly: { name: '3 Ayda Bir', days: 90 },
        yearly: { name: 'Yıllık', days: 365 },
        custom: { name: 'Özel', days: null }
    },
    
    async add(data) {
        const bill = {
            id: Utils.generateId(),
            profileId: AppState.currentProfile.id,
            name: data.name,
            amount: parseFloat(data.amount),
            dueDate: data.dueDate,
            frequency: data.frequency || 'monthly',
            customDays: data.customDays || null,
            category: data.category || 'bills',
            isPaid: false,
            autoPay: data.autoPay || false,
            reminders: data.reminders || [1, 7], // Days before due date
            notes: data.notes || '',
            createdAt: new Date().toISOString()
        };
        
        await DBManager.add('bills', bill);
        AppState.bills.push(bill);
        
        Utils.showToast('Fatura eklendi', 'success');
        DataManager.updateBadges();
        this.scheduleReminder(bill);
        
        return bill;
    },
    
    async markPaid(billId) {
        const bill = AppState.bills.find(b => b.id === billId);
        if (!bill || bill.isPaid) return null;
        
        const updated = { ...bill, isPaid: true, paidDate: new Date().toISOString() };
        let nextBill;
        
        // If recurring, create next bill
        if (bill.frequency !== 'once') {
            const nextDueDate = this.calculateNextDueDate(bill);
            nextBill = {
                ...bill,
                id: Utils.generateId(),
                dueDate: nextDueDate,
                anchorDay: bill.anchorDay || new Date(bill.dueDate + 'T12:00:00').getDate(),
                isPaid: false,
                paidDate: null,
                createdAt: new Date().toISOString()
            };
            
        }
        
        await DBManager.writeMany([
            { store: 'bills', operation: 'put', data: updated },
            ...(nextBill ? [{ store: 'bills', operation: 'add', data: nextBill }] : [])
        ]);
        Object.assign(bill, updated);
        if (nextBill) AppState.bills.push(nextBill);
        Utils.showToast('Fatura ödendi olarak işaretlendi', 'success');
        DataManager.updateBadges();
        
        return bill;
    },
    
    calculateNextDueDate(bill) {
        const currentDue = new Date(bill.dueDate + 'T12:00:00');
        const months = { monthly: 1, bimonthly: 2, quarterly: 3, yearly: 12 };
        if (bill.frequency === 'custom') {
            const days = Number(bill.customDays);
            if (!Number.isInteger(days) || days < 1) throw new Error('Tekrar aralığı pozitif tam sayı olmalı.');
            currentDue.setDate(currentDue.getDate() + days);
        } else if (months[bill.frequency]) {
            const day = bill.anchorDay || currentDue.getDate();
            currentDue.setDate(1);
            currentDue.setMonth(currentDue.getMonth() + months[bill.frequency]);
            const last = new Date(currentDue.getFullYear(), currentDue.getMonth() + 1, 0).getDate();
            currentDue.setDate(Math.min(day, last));
        }
        return Utils.formatDateInput(currentDue);
    },
    
    async delete(billId) {
        await DBManager.delete('bills', billId);
        AppState.bills = AppState.bills.filter(b => b.id !== billId);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('bills', billId);
        }
        Utils.showToast('Fatura silindi', 'success');
        DataManager.updateBadges();
    },
    
    getUpcoming(days = 30) {
        const now = new Date();
        const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        
        return AppState.bills
            .filter(b => {
                const dueDate = new Date(b.dueDate);
                return !b.isPaid && dueDate >= now && dueDate <= futureDate;
            })
            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    },
    
    getOverdue() {
        const now = new Date();
        return AppState.bills.filter(b => {
            const dueDate = new Date(b.dueDate);
            return !b.isPaid && dueDate < now;
        });
    },
    
    calculateLateFee(bill, daysLate) {
        // Simple late fee calculation (can be customized)
        const baseRate = 0.02; // 2% per month
        const dailyRate = baseRate / 30;
        return bill.amount * dailyRate * daysLate;
    },
    
    scheduleReminder(bill) {
        // This would integrate with push notifications
        // For now, we'll check on app load
        if (!bill.reminders || bill.isPaid) return;
        
        const now = new Date();
        const dueDate = new Date(bill.dueDate);
        const daysUntilDue = Math.ceil((dueDate - now) / (24 * 60 * 60 * 1000));
        
        bill.reminders.forEach(reminderDays => {
            if (daysUntilDue === reminderDays) {
                this.showReminder(bill, daysUntilDue);
            }
        });
    },
    
    showReminder(bill, daysUntilDue) {
        const message = daysUntilDue === 0 
            ? `${bill.name} faturası bugün son ödeme günü!`
            : `${bill.name} faturası için ${daysUntilDue} gün kaldı`;
        
        Utils.addNotification({
            type: 'warning',
            icon: 'bi:receipt',
            title: 'Fatura Hatırlatıcısı',
            message,
            time: daysUntilDue === 0 ? 'Bugün' : `${daysUntilDue} gün kaldı`,
            key: `bill-reminder:${bill.id}:${daysUntilDue}:${new Date().toISOString().slice(0, 10)}`
        });

        Utils.showToast(message, 'warning');
        Utils.speak(message);
        
        // If notifications are enabled
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Fatura Hatırlatıcısı', {
                body: message,
                icon: '/icons/icon-192.png'
            });
        }
    },
    
    getTotalMonthly() {
        return AppState.bills
            .filter(b => !b.isPaid && b.frequency === 'monthly')
            .reduce((sum, b) => sum + b.amount, 0);
    }
};

// ============================================
// NOTE MANAGER
// ============================================
const NoteManager = {
    async add(data) {
        const note = {
            id: Utils.generateId(),
            profileId: AppState.currentProfile.id,
            title: data.title || 'Başlıksız Not',
            content: data.content || '',
            tags: data.tags || [],
            linkedTransactions: data.linkedTransactions || [],
            attachments: data.attachments || [],
            color: data.color || '#2563EB',
            isPinned: data.isPinned || false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        await DBManager.add('notes', note);
        AppState.notes.push(note);
        
        Utils.showToast('Not eklendi', 'success');
        return note;
    },
    
    async update(noteId, data) {
        const note = AppState.notes.find(n => n.id === noteId);
        if (!note) return null;
        
        Object.assign(note, data, { updatedAt: new Date().toISOString() });
        await DBManager.put('notes', note);
        
        return note;
    },
    
    async delete(noteId) {
        await DBManager.delete('notes', noteId);
        AppState.notes = AppState.notes.filter(n => n.id !== noteId);
        if (typeof FirebaseSync !== 'undefined') {
            FirebaseSync.queueDeletion('notes', noteId);
        }
        Utils.showToast('Not silindi', 'success');
    },
    
    async togglePin(noteId) {
        const note = AppState.notes.find(n => n.id === noteId);
        if (!note) return null;
        
        note.isPinned = !note.isPinned;
        await DBManager.put('notes', note);
        
        return note;
    },
    
    searchByTag(tag) {
        return AppState.notes.filter(n => 
            n.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
        );
    },
    
    searchByContent(query) {
        const lowerQuery = query.toLowerCase();
        return AppState.notes.filter(n => 
            n.title.toLowerCase().includes(lowerQuery) ||
            n.content.toLowerCase().includes(lowerQuery)
        );
    }
};

// ============================================
// REPORT GENERATOR
// ============================================
const ReportGenerator = {
    generateMonthlyReport(month, year) {
        const monthlyData = DataManager.getMonthlyData(month, year);
        const categoryTotals = DataManager.getCategoryTotals('expense', month, year);
        
        // Previous month for comparison
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const prevData = DataManager.getMonthlyData(prevMonth, prevYear);
        
        return {
            period: `${Utils.getMonthName(month)} ${year}`,
            summary: {
                income: monthlyData.income,
                expense: monthlyData.expense,
                balance: monthlyData.balance,
                savingsRate: monthlyData.income > 0 
                    ? ((monthlyData.balance / monthlyData.income) * 100).toFixed(1) 
                    : 0
            },
            comparison: {
                incomeChange: prevData.income > 0 
                    ? (((monthlyData.income - prevData.income) / prevData.income) * 100).toFixed(1)
                    : 0,
                expenseChange: prevData.expense > 0
                    ? (((monthlyData.expense - prevData.expense) / prevData.expense) * 100).toFixed(1)
                    : 0
            },
            topExpenses: categoryTotals.slice(0, 5),
            transactionCount: monthlyData.transactions.length,
            averageExpense: monthlyData.transactions.filter(t => t.type === 'expense').length > 0
                ? (monthlyData.expense / monthlyData.transactions.filter(t => t.type === 'expense').length).toFixed(2)
                : 0
        };
    },
    
    generateYearlyReport(year) {
        const monthlyReports = [];
        let totalIncome = 0;
        let totalExpense = 0;
        
        for (let month = 0; month < 12; month++) {
            const data = DataManager.getMonthlyData(month, year);
            monthlyReports.push({
                month: Utils.getMonthName(month),
                ...data
            });
            totalIncome += data.income;
            totalExpense += data.expense;
        }
        
        return {
            year,
            totalIncome,
            totalExpense,
            totalBalance: totalIncome - totalExpense,
            averageMonthlyIncome: totalIncome / 12,
            averageMonthlyExpense: totalExpense / 12,
            monthlyBreakdown: monthlyReports,
            bestMonth: monthlyReports.reduce((best, m) => 
                m.balance > best.balance ? m : best, monthlyReports[0]),
            worstMonth: monthlyReports.reduce((worst, m) => 
                m.balance < worst.balance ? m : worst, monthlyReports[0])
        };
    },
    
    generateNetWorthReport() {
        const currency = AppState.currentProfile?.currency || 'TRY';
        
        // Calculate total assets
        const investmentValue = InvestmentManager.getTotalValue();
        const lentMoney = DebtManager.getTotalLent();
        const cashBalance = AppState.currentProfile?.openingBalance || 0;
        
        // Calculate total liabilities
        const borrowedMoney = DebtManager.getTotalBorrowed();
        const unpaidBills = AppState.bills
            .filter(b => !b.isPaid)
            .reduce((sum, b) => sum + b.amount, 0);
        
        const totalAssets = investmentValue + lentMoney + cashBalance;
        const totalLiabilities = borrowedMoney + unpaidBills;
        const netWorth = totalAssets - totalLiabilities;
        
        return {
            assets: {
                investments: investmentValue,
                lentMoney,
                cash: cashBalance,
                total: totalAssets
            },
            liabilities: {
                debts: borrowedMoney,
                unpaidBills,
                total: totalLiabilities
            },
            netWorth,
            currency
        };
    },
    
    // What-if Analysis
    whatIfAnalysis(scenario) {
        const currentData = DataManager.getMonthlyData(
            AppState.currentMonth,
            AppState.currentYear
        );
        
        let projectedExpense = currentData.expense;
        let projectedIncome = currentData.income;
        
        // Apply scenario changes
        if (scenario.expenseChanges) {
            scenario.expenseChanges.forEach(change => {
                if (change.type === 'percentage') {
                    projectedExpense *= (1 + change.value / 100);
                } else {
                    projectedExpense += change.value;
                }
            });
        }
        
        if (scenario.incomeChanges) {
            scenario.incomeChanges.forEach(change => {
                if (change.type === 'percentage') {
                    projectedIncome *= (1 + change.value / 100);
                } else {
                    projectedIncome += change.value;
                }
            });
        }
        
        const projectedBalance = projectedIncome - projectedExpense;
        const currentBalance = currentData.balance;
        
        return {
            current: {
                income: currentData.income,
                expense: currentData.expense,
                balance: currentBalance
            },
            projected: {
                income: projectedIncome,
                expense: projectedExpense,
                balance: projectedBalance
            },
            difference: {
                income: projectedIncome - currentData.income,
                expense: projectedExpense - currentData.expense,
                balance: projectedBalance - currentBalance
            },
            impact: projectedBalance >= 0 ? 'positive' : 'negative'
        };
    },
    
    exportToCSV(data, filename) {
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(h => `"${row[h]}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
    },
    
    exportToJSON(data, filename) {
        const jsonContent = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.json`;
        link.click();
    }
};

// ============================================
// CURRENCY & RATES
// ============================================
const CurrencyManager = {
    rates: {},
    lastUpdate: null,
    
    async fetchRates(baseCurrency = 'TRY') {
        try {
            // Using exchangerate.host free API
            const response = await fetch(
                `https://api.exchangerate.host/latest?base=${baseCurrency}`
            );
            const data = await response.json();
            
            if (data.success) {
                this.rates = data.rates;
                this.lastUpdate = new Date();
                localStorage.setItem('exchangeRates', JSON.stringify({
                    rates: this.rates,
                    lastUpdate: this.lastUpdate
                }));
            }
            
            return this.rates;
        } catch (error) {
            console.error('Failed to fetch exchange rates:', error);
            // Load from cache
            const cached = localStorage.getItem('exchangeRates');
            if (cached) {
                const { rates, lastUpdate } = JSON.parse(cached);
                this.rates = rates;
                this.lastUpdate = new Date(lastUpdate);
            }
            return this.rates;
        }
    },
    
    convert(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;
        
        const fromRate = this.rates[fromCurrency] || 1;
        const toRate = this.rates[toCurrency] || 1;
        
        return (amount / fromRate) * toRate;
    },
    
    async getCryptoPrice(symbol) {
        try {
            const response = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=try,usd,eur`
            );
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch crypto price:', error);
            return null;
        }
    }
};

// ============================================
// BACKUP & SYNC
// ============================================
const BackupManager = {
    async exportAll() { return exportData(); },
    async importBackup(file) {
        const text = await file.text();
        const raw = file.name.toLowerCase().endsWith('.fpb') ? decodeURIComponent(atob(text)) : text;
        const data = DataSafety.backup(JSON.parse(raw));
        if (!await Dialog.confirmAction('Bu yedek açık veri alanındaki kayıtların yerini alacak. Devam edilsin mi?', { title: 'Yedeği yükle' })) return false;
        await BackupService.restore(data);
        window.location.reload();
        return true;
    }
};

// ============================================
// NOTIFICATION MANAGER
// ============================================
const NotificationManager = {
    async requestPermission() {
        if (!('Notification' in window)) {
            console.log('Notifications not supported');
            return false;
        }
        
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    },
    
    async scheduleNotification(title, body, scheduledTime) {
        if (!('serviceWorker' in navigator)) return;
        
        const registration = await navigator.serviceWorker.ready;
        
        // Calculate delay
        const delay = new Date(scheduledTime) - new Date();
        if (delay <= 0) return;
        
        // For now, we'll use setTimeout (in production, use Background Sync API)
        setTimeout(() => {
            registration.showNotification(title, {
                body,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-72.png',
                vibrate: [100, 50, 100]
            });
        }, delay);
    },
    
    checkBillReminders() {
        const upcoming = BillManager.getUpcoming(7);
        
        upcoming.forEach(bill => {
            const dueDate = new Date(bill.dueDate);
            const now = new Date();
            const daysUntil = Math.ceil((dueDate - now) / (24 * 60 * 60 * 1000));
            
            if (bill.reminders.includes(daysUntil)) {
                BillManager.showReminder(bill, daysUntil);
            }
        });
    }
};

// Export modules for global access
window.DebtManager = DebtManager;
window.InvestmentManager = InvestmentManager;
window.BillManager = BillManager;
window.NoteManager = NoteManager;
window.ReportGenerator = ReportGenerator;
window.CurrencyManager = CurrencyManager;
window.BackupManager = BackupManager;
window.NotificationManager = NotificationManager;

