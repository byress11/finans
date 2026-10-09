// Presentation helpers only; existing managers own all persisted data.
const AppUX = {
    init() {
        this.renderContext();
        if (this.initialized) return;
        this.initialized = true;
        const topbar = document.getElementById('appTopbar');
        if (topbar) {
            const reserveTopbarSpace = () => document.documentElement.style.setProperty('--app-topbar-height', `${Math.ceil(topbar.getBoundingClientRect().height)}px`);
            reserveTopbarSpace();
            if (typeof ResizeObserver !== 'undefined') {
                this.topbarObserver = new ResizeObserver(reserveTopbarSpace);
                this.topbarObserver.observe(topbar);
            }
            window.addEventListener('resize', reserveTopbarSpace);
        }
        document.addEventListener('click', event => {
            const button = event.target.closest?.('button, [role="button"]');
            if (!button || button.disabled) return;
            button.classList.add('press-feedback');
            setTimeout(() => button.classList.remove('press-feedback'), 160);
        });
    },
    renderContext() {
        const container = document.getElementById('profileShortcuts');
        if (!container) return;
        container.replaceChildren();
        const colors = ['#2563eb', '#9333ea', '#0f766e', '#c2410c'];
        AppState.profiles.forEach((profile, index) => {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'profile-chip';
            button.textContent = (profile.isLocked ? '🔒 ' : '') + profile.name;
            button.style.setProperty('--profile-color', colors[index % colors.length]);
            button.setAttribute('aria-pressed', String(profile.id === AppState.currentProfile?.id));
            button.addEventListener('click', () => ProfileManager.switchProfile(profile.id));
            container.append(button);
        });
        const label = document.getElementById('quickProfileLabel');
        if (label) label.textContent = `${AppState.currentProfile?.name || ''} profiline kaydedilecek`;
    },
    renderOverview() {
        const period = document.getElementById('overviewPeriod');
        if (period) period.textContent = new Date(AppState.currentYear, AppState.currentMonth, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
        const container = document.getElementById('upcomingPayments');
        if (!container) return;
        container.replaceChildren();
        const bills = AppState.bills.filter(b => !b.isPaid && b.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);
        if (!bills.length) {
            const p = document.createElement('p'); p.className = 'muted';
            p.textContent = 'Bekleyen ödeme hatırlatıcısı yok.'; container.append(p);
        }
        for (const bill of bills) {
            const button = document.createElement('button'); button.className = 'upcoming-payment';
            const name = document.createElement('span'); name.textContent = bill.name;
            const date = document.createElement('small'); date.textContent = Utils.formatDate(bill.dueDate, 'long');
            const info = document.createElement('span'); info.append(name, date);
            // Shared bills may belong to another profile/currency.
            const owner = AppState.profiles.find(p => p.id === bill.profileId);
            const amount = document.createElement('strong'); amount.textContent = Utils.formatCurrency(bill.amount, owner?.currency || 'TRY');
            button.append(info, amount); button.addEventListener('click', () => navigateTo('bills'));
            container.append(button);
        }
    },
    setPeriod(period) {
        const input = document.getElementById('transactionMonthFilter');
        if (!input) return;
        const now = new Date();
        if (period === 'previous') now.setMonth(now.getMonth() - 1, 1);
        input.value = period === 'all' ? '' : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        TransactionsPage.renderAll();
    },
    renderPeriod() {
        const input = document.getElementById('transactionMonthFilter');
        const label = document.getElementById('transactionPeriodLabel');
        if (!input || !label) return;
        label.textContent = input.value ? new Date(input.value + '-01T12:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : 'Tüm tarihler · tarihsiz kayıtlar dahil';
        const now = new Date(), previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const month = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const values = { current: month(now), previous: month(previous), all: '' };
        document.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(input.value === values[button.dataset.period])));
    },
    toggleCategories() {
        const panel = document.getElementById('quickAddPanel');
        panel.dataset.allCategories = panel.dataset.allCategories === 'true' ? 'false' : 'true';
        renderQuickCategoryGrid(document.getElementById('quickType').value);
    },
    async save(button, work, label = 'Kaydediliyor…') {
        if (!button || button.disabled) return;
        const original = button.innerHTML;
        button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = label;
        try { return await work(); }
        catch (error) { Utils.showToast('Kaydedilemedi. Girdiğiniz bilgiler korundu.', 'error'); }
        finally { button.innerHTML = original; button.disabled = false; button.removeAttribute('aria-busy'); }
    }
};
