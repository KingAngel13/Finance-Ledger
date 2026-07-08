// Local Engine Registrations
let currentWorkingMonth = document.getElementById('budget-month').value;
let currentWorkingFortnight = document.getElementById('budget-fortnight').value;
let allMonthsData = JSON.parse(localStorage.getItem('budget_system_all_months')) || {};
let historyArchives = JSON.parse(localStorage.getItem('budget_history_archives')) || [];

let transactions = [];
let isHistoricalMode = false;
let donutChart, barChart;
let bsModal;

// Vintage Calculator Properties
let calcExpressionStr = ""; 
let isCalcResetOnNextKey = false;
let calcHistoryTape = [];

document.addEventListener("DOMContentLoaded", function() {
    bsModal = new bootstrap.Modal(document.getElementById('crudModal'));
    initCharts();
    refreshActiveTargetPeriod();
    setupEventListeners();
});

function refreshActiveTargetPeriod() {
    currentWorkingMonth = document.getElementById('budget-month').value;
    currentWorkingFortnight = document.getElementById('budget-fortnight').value;
    // Creates unique combination key (e.g. "July-1/2")
    let storageLookupKey = `${currentWorkingMonth}-${currentWorkingFortnight}`;
    loadMonthData(storageLookupKey);
}

function setupEventListeners() {
    const typeSelect = document.getElementById('tx-type');
    const container = document.getElementById('desc-field-container');
    const customContainer = document.getElementById('custom-desc-container');
    
    document.getElementById('budget-month').addEventListener('change', refreshActiveTargetPeriod);
    document.getElementById('budget-fortnight').addEventListener('change', refreshActiveTargetPeriod);

    typeSelect.addEventListener('change', function() {
        const catSelect = document.getElementById('tx-cat');
        if (this.value === 'Income') {
            catSelect.disabled = true;
            catSelect.value = "";
            container.innerHTML = `
                <label class="form-label small fw-bold text-muted">Source Asset Identity</label>
                <select id="tx-desc-dropdown" class="form-select form-dark-input" required>
                    <option value="Radius Rimu Park">Radius Rimu Park</option>
                    <option value="St. Pierre's Sushi">St. Pierre's Sushi</option>
                    <option value="McDonald's Kamo">McDonald's Kamo</option>
                    <option value="Radius Potter Home">Radius Potter Home</option>
                    <option value="Others">Others</option>
                </select>
            `;
            document.getElementById('tx-desc-dropdown').addEventListener('change', handleIncomeDescChange);
        } else {
            catSelect.disabled = false;
            catSelect.value = "Food & Groceries";
            customContainer.classList.add('d-none');
            document.getElementById('tx-desc-custom').required = false;
            container.innerHTML = `
                <label class="form-label small fw-bold text-muted">Merchant</label>
                <input type="text" id="tx-desc-text" class="form-control form-dark-input" placeholder="e.g. Pack'nSave" required>
            `;
        }
    });

    document.getElementById('transaction-form').addEventListener('submit', function(e) {
        e.preventDefault();
        if (isHistoricalMode) return;

        const type = typeSelect.value;
        const amountTyped = parseFloat(document.getElementById('tx-amount').value) || 0;
        const entryMode = document.getElementById('tx-entry-mode').value;
        const cat = document.getElementById('tx-cat').value;
        let finalDescription = "";

        if (type === 'Income') {
            const dropdownVal = document.getElementById('tx-desc-dropdown').value;
            if (dropdownVal === 'Others') {
                finalDescription = document.getElementById('tx-desc-custom').value.trim() || "Other Income Streams";
            } else {
                finalDescription = dropdownVal;
            }
        } else {
            finalDescription = document.getElementById('tx-desc-text').value.trim();
        }

        let expectedValue = amountTyped;
        let actualValue = entryMode === 'actual' ? amountTyped : 0;

        transactions.push({ type, desc: finalDescription, expected: expectedValue, actual: actualValue, cat });
        saveMonthData();
        
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-entry-mode').value = 'expected';
        if (type === 'Income') {
            document.getElementById('tx-desc-dropdown').value = 'Radius Rimu Park';
            document.getElementById('tx-desc-custom').value = '';
            customContainer.classList.add('d-none');
        } else {
            document.getElementById('tx-desc-text').value = '';
        }
        calculateBudget();
    });
}

function handleIncomeDescChange() {
    const customContainer = document.getElementById('custom-desc-container');
    const customInput = document.getElementById('tx-desc-custom');
    if (this.value === 'Others') {
        customContainer.classList.remove('d-none');
        customInput.required = true;
        customInput.focus();
    } else {
        customContainer.classList.add('d-none');
        customInput.required = false;
    }
}

function pressCalcKey(key) {
    const display = document.getElementById('calc-screen');
    const operators = ['+', '-', '*', '/'];

    if (key === 'C') {
        calcExpressionStr = "";
        display.innerText = "0";
        isCalcResetOnNextKey = false;
        return;
    }

    if (key === '=') {
        if (calcExpressionStr === "") return;
        let cleanExpr = calcExpressionStr.trim();
        if (operators.includes(cleanExpr.slice(-1))) cleanExpr = cleanExpr.slice(0, -1).trim();

        try {
            let outcome = Function(`"use strict"; return (${cleanExpr})`)();
            let displayExpr = cleanExpr.replace(/\*/g, '×').replace(/\//g, '÷');
            pushCalcHistoryTape(`${displayExpr} = <span>$${outcome.toFixed(2)}</span>`);
            calcExpressionStr = outcome.toString();
            display.innerText = calcExpressionStr;
            isCalcResetOnNextKey = true; 
        } catch (e) {
            display.innerText = "ERROR";
            calcExpressionStr = "";
        }
        return;
    }

    if (operators.includes(key)) {
        if (calcExpressionStr === "") {
            if (key === '-') { calcExpressionStr = "-"; display.innerText = "-"; }
            return;
        }
        let lastChar = calcExpressionStr.trim().slice(-1);
        if (operators.includes(lastChar)) {
            calcExpressionStr = calcExpressionStr.trim().slice(0, -1) + " " + key + " ";
        } else {
            calcExpressionStr = calcExpressionStr.trim() + " " + key + " ";
        }
        display.innerText = calcExpressionStr.replace(/\*/g, '×').replace(/\//g, '÷');
        isCalcResetOnNextKey = false;
    } else {
        if (isCalcResetOnNextKey) { calcExpressionStr = ""; isCalcResetOnNextKey = false; }
        if (calcExpressionStr === "0" && key !== '.') calcExpressionStr = "";
        calcExpressionStr += key;
        display.innerText = calcExpressionStr.replace(/\*/g, '×').replace(/\//g, '÷');
    }
}

function pushCalcHistoryTape(lineItem) {
    calcHistoryTape.push(lineItem);
    if (calcHistoryTape.length > 5) calcHistoryTape.shift();
    renderCalcTape();
}

function renderCalcTape() {
    const tapeBox = document.getElementById('calc-tape');
    if(calcHistoryTape.length === 0) {
        tapeBox.innerHTML = `<div class="tape-row empty-tape-msg">Tape Empty</div>`;
        return;
    }
    tapeBox.innerHTML = calcHistoryTape.map(row => `<div class="tape-row">${row}</div>`).join('');
    tapeBox.scrollTop = tapeBox.scrollHeight;
}

function clearCalcTape() { calcHistoryTape = []; renderCalcTape(); }

function saveMonthData() {
    if (isHistoricalMode) return;
    let storageLookupKey = `${currentWorkingMonth}-${currentWorkingFortnight}`;
    allMonthsData[storageLookupKey] = transactions;
    localStorage.setItem('budget_system_all_months', JSON.stringify(allMonthsData));
}

function triggerManualSaveFeedback() {
    if (isHistoricalMode) return;
    saveMonthData();
    alert(`📁 Locked into storage for ${currentWorkingMonth} Fortnight ${currentWorkingFortnight}!`);
}

function clearCurrentMonthLogs() {
    if (isHistoricalMode) return;
    if (!confirm(`⚠️ Flush logs for ${currentWorkingMonth} (${currentWorkingFortnight})?`)) return;
    transactions = [];
    saveMonthData();
    calculateBudget();
}

function loadMonthData(storageLookupKey) {
    const historicalRecord = historyArchives.find(r => r.month === storageLookupKey);
    const deleteArchiveBtn = document.getElementById('delete-archive-btn');
    const historicalBadge = document.getElementById('historical-badge');
    const loggerCard = document.getElementById('logger-card');
    const archiveBtn = document.getElementById('archive-btn');
    const manualSaveBtn = document.getElementById('manual-save-btn');
    const clearMonthBtn = document.getElementById('clear-month-btn');

    if (historicalRecord) {
        isHistoricalMode = true;
        transactions = historicalRecord.ledgerSnapshot;
        deleteArchiveBtn.classList.remove('d-none');
        historicalBadge.classList.remove('d-none');
        loggerCard.classList.add('opacity-50', 'pe-none');
        archiveBtn.classList.add('d-none');
        if (manualSaveBtn) manualSaveBtn.classList.add('d-none');
        if (clearMonthBtn) clearMonthBtn.classList.add('d-none');
    } else {
        isHistoricalMode = false;
        transactions = allMonthsData[storageLookupKey] || [];
        deleteArchiveBtn.classList.add('d-none');
        historicalBadge.classList.add('d-none');
        loggerCard.classList.remove('opacity-50', 'pe-none');
        archiveBtn.classList.remove('d-none');
        if (manualSaveBtn) manualSaveBtn.classList.remove('d-none');
        if (clearMonthBtn) clearMonthBtn.classList.remove('d-none');
    }
    calculateBudget();
}

function openCrudModal(idx) {
    if (isHistoricalMode) return;
    const item = transactions[idx];
    document.getElementById('edit-idx').value = idx;
    document.getElementById('edit-desc').value = item.desc;
    document.getElementById('edit-expected').value = item.expected;
    document.getElementById('edit-actual').value = item.actual;
    bsModal.show();
}

function commitCrudEdit() {
    const idx = parseInt(document.getElementById('edit-idx').value);
    transactions[idx].expected = parseFloat(document.getElementById('edit-expected').value) || 0;
    transactions[idx].actual = parseFloat(document.getElementById('edit-actual').value) || 0;
    bsModal.hide();
    saveMonthData();
    calculateBudget();
}

function deleteCrudRow(idx) {
    if (isHistoricalMode) return;
    if (!confirm("Exterminate this row component?")) return;
    transactions.splice(idx, 1);
    saveMonthData();
    calculateBudget();
}

function calculateBudget() {
    let actInc = 0, expInc = 0;
    let actExp = 0, expExp = 0;
    let catTotals = { "Food & Groceries": { act: 0, exp: 0 }, "Utilities": { act: 0, exp: 0 }, "Shopping": { act: 0, exp: 0 }, "Savings": { act: 0, exp: 0 } };

    const incomeBody = document.getElementById('income-log-body');
    const expenseBody = document.getElementById('expense-log-body');
    const subBodies = {
        "Food & Groceries": document.getElementById('sub-body-food'),
        "Utilities": document.getElementById('sub-body-utilities'),
        "Shopping": document.getElementById('sub-body-shopping'),
        "Savings": document.getElementById('sub-body-savings')
    };

    incomeBody.innerHTML = ''; expenseBody.innerHTML = '';
    Object.values(subBodies).forEach(el => el.innerHTML = '');

    transactions.forEach((t, index) => {
        const actionButtons = isHistoricalMode ? `-` : `
            <div class="d-flex gap-1 justify-content-center">
                <button type="button" class="btn btn-xs btn-outline-secondary" onclick="openCrudModal(${index})"><i class="bi bi-pencil"></i></button>
                <button type="button" class="btn btn-xs btn-outline-danger" onclick="deleteCrudRow(${index})"><i class="bi bi-x-lg"></i></button>
            </div>
        `;

        if (t.type === 'Income') {
            expInc += t.expected; actInc += t.actual;
            incomeBody.innerHTML += `
                <tr>
                    <td class="fw-medium text-truncate" style="max-width:85px;">${t.desc}</td>
                    <td class="text-end">$${t.expected.toFixed(0)}</td>
                    <td class="text-end fw-bold text-success">$${t.actual.toFixed(0)}</td>
                    <td class="text-center">${actionButtons}</td>
                </tr>`;
        } else {
            expExp += t.expected; actExp += t.actual;
            if (catTotals.hasOwnProperty(t.cat)) {
                catTotals[t.cat].exp += t.expected;
                catTotals[t.cat].act += t.actual;
                subBodies[t.cat].innerHTML += `
                    <tr class="font-xs">
                        <td class="text-truncate" style="max-width:80px;">${t.desc}</td>
                        <td class="text-end text-muted">$${t.expected.toFixed(0)}</td>
                        <td class="text-end fw-bold">$${t.actual.toFixed(0)}</td>
                    </tr>`;
            }

            expenseBody.innerHTML += `
                <tr>
                    <td class="fw-medium text-truncate" style="max-width:80px;">${t.desc}</td>
                    <td class="text-end">$${t.expected.toFixed(0)}</td>
                    <td class="text-end fw-bold text-danger">$${t.actual.toFixed(0)}</td>
                    <td class="text-center"><span class="badge bg-secondary font-xs" style="padding:2px 4px;">${t.cat.split(' ')[0]}</span></td>
                    <td class="text-center">${actionButtons}</td>
                </tr>`;
        }
    });

    Object.keys(catTotals).forEach(cKey => {
        const idSafe = cKey.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-');
        const elementId = idSafe === 'food-groceries' ? 'food' : idSafe;
        document.getElementById(`sub-goal-${elementId}`).innerText = `$${catTotals[cKey].exp.toFixed(0)}`;
        document.getElementById(`sub-act-${elementId}`).innerText = `$${catTotals[cKey].act.toFixed(0)}`;
    });

    document.getElementById('sum-actual-income').innerText = `$${actInc.toFixed(0)}`;
    document.getElementById('sum-expected-income').innerText = `$${expInc.toFixed(0)}`;
    document.getElementById('sum-actual-expenses').innerText = `$${actExp.toFixed(0)}`;
    document.getElementById('sum-expected-expenses').innerText = `$${expExp.toFixed(0)}`;

    document.getElementById('sum-actual-food').innerText = `$${catTotals["Food & Groceries"].act.toFixed(0)}`;
    document.getElementById('sum-expected-food').innerText = `$${catTotals["Food & Groceries"].exp.toFixed(0)}`;
    document.getElementById('sum-actual-utilities').innerText = `$${catTotals["Utilities"].act.toFixed(0)}`;
    document.getElementById('sum-expected-utilities').innerText = `$${catTotals["Utilities"].exp.toFixed(0)}`;
    document.getElementById('sum-actual-shopping').innerText = `$${catTotals["Shopping"].act.toFixed(0)}`;
    document.getElementById('sum-expected-shopping').innerText = `$${catTotals["Shopping"].exp.toFixed(0)}`;
    document.getElementById('sum-actual-savings').innerText = `$${catTotals["Savings"].act.toFixed(0)}`;
    document.getElementById('sum-expected-savings').innerText = `$${catTotals["Savings"].exp.toFixed(0)}`;

    document.getElementById('pct-income').innerText = expInc ? `${Math.round((actInc / expInc) * 100)}%` : '0%';
    document.getElementById('pct-expenses').innerText = expExp ? `${Math.round((actExp / expExp) * 100)}%` : '0%';
    document.getElementById('pct-food').innerText = catTotals["Food & Groceries"].exp ? `${Math.round((catTotals["Food & Groceries"].act / catTotals["Food & Groceries"].exp) * 100)}%` : '0%';
    document.getElementById('pct-utilities').innerText = catTotals["Utilities"].exp ? `${Math.round((catTotals["Utilities"].act / catTotals["Utilities"].exp) * 100)}%` : '0%';
    document.getElementById('pct-shopping').innerText = catTotals["Shopping"].exp ? `${Math.round((catTotals["Shopping"].act / catTotals["Shopping"].exp) * 100)}%` : '0%';
    document.getElementById('pct-savings').innerText = catTotals["Savings"].exp ? `${Math.round((catTotals["Savings"].act / catTotals["Savings"].exp) * 100)}%` : '0%';

    document.getElementById('net-actual').innerText = `$${(actInc - actExp).toFixed(0)}`;
    document.getElementById('net-expected').innerText = `$${(expInc - expExp).toFixed(0)}`;

    updateCharts(catTotals, actInc, actExp, expInc, expExp);
}

function archiveCurrentMonth() {
    if (isHistoricalMode) return;
    if(transactions.length === 0) return alert("Empty ledger cannot be archived!");
    let storageLookupKey = `${currentWorkingMonth}-${currentWorkingFortnight}`;
    if(!confirm(`Lock historical archive for ${currentWorkingMonth} F${currentWorkingFortnight}?`)) return;

    historyArchives = historyArchives.filter(r => r.month !== storageLookupKey);
    historyArchives.push({ month: storageLookupKey, ledgerSnapshot: [...transactions] });
    localStorage.setItem('budget_history_archives', JSON.stringify(historyArchives));

    alert(`Archived successfully.`);
    refreshActiveTargetPeriod();
}

function deleteSelectedArchiveRecord() {
    if (!isHistoricalMode) return;
    let storageLookupKey = `${currentWorkingMonth}-${currentWorkingFortnight}`;
    if (!confirm(`Unlock archive records for ${currentWorkingMonth} F${currentWorkingFortnight}?`)) return;

    historyArchives = historyArchives.filter(r => r.month !== storageLookupKey);
    localStorage.setItem('budget_history_archives', JSON.stringify(historyArchives));
    refreshActiveTargetPeriod();
}

function initCharts() {
    Chart.defaults.color = '#475569';
    const ctxDonut = document.getElementById('expenseDonutChart').getContext('2d');
    donutChart = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
            labels: ['Food', 'Util', 'Shop', 'Save'],
            datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#ef4444', '#eab308', '#3b82f6', '#22c55e'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const ctxBar = document.getElementById('actualVsGoalChart').getContext('2d');
    barChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Inc', 'Exp', 'Fd', 'Ut', 'Sh', 'Sv'],
            datasets: [
                { label: 'Act', data: [0,0,0,0,0,0], backgroundColor: '#22c55e' },
                { label: 'Exp', data: [0,0,0,0,0,0], backgroundColor: '#94a3b8' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

function updateCharts(catTotals, actInc, actExp, expInc, expExp) {
    donutChart.data.datasets[0].data = [catTotals["Food & Groceries"].act, catTotals["Utilities"].act, catTotals["Shopping"].act, catTotals["Savings"].act];
    donutChart.update();

    barChart.data.datasets[0].data = [actInc, actExp, catTotals["Food & Groceries"].act, catTotals["Utilities"].act, catTotals["Shopping"].act, catTotals["Savings"].act];
    barChart.data.datasets[1].data = [expInc, expExp, catTotals["Food & Groceries"].exp, catTotals["Utilities"].exp, catTotals["Shopping"].exp, catTotals["Savings"].exp];
    barChart.update();
}
