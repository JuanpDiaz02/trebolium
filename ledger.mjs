export const order = (a, b) => a.date.localeCompare(b.date) || a.id - b.id;
export const accountOrder = (a, b) => a.code.localeCompare(b.code, 'es', {numeric: true});
export const parent = code => code.slice(0, Math.max(0, code.lastIndexOf('.')));
export const net = line => line.debit - line.credit;
export const sum = lines => lines.reduce((total, line) => ({
  debit: total.debit + line.debit,
  credit: total.credit + line.credit
}), {debit: 0, credit: 0});

export function balances(entries) {
  const totals = new Map();
  for (const {lines} of entries) {
    for (const line of lines) {
      const {debit, credit} = totals.get(line.code) || {debit: 0, credit: 0};
      totals.set(line.code, {debit: debit + line.debit, credit: credit + line.credit});
    }
  }
  return totals;
}

export function nextDay(date) {
  const day = new Date(date);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

export function closingEntries(entries, date, resultCode) {
  const makeLine = (code, amount) => ({
    code, debit: Math.max(amount, 0), credit: Math.max(-amount, 0)
  });
  const totals = balances(entries.filter(entry => entry.date <= date));
  const resultLines = [];
  const assetLines = [];
  let result = 0;
  for (const [code, total] of totals) {
    const balance = net(total);
    if (!balance) continue;
    if (code.startsWith('4.')) {
      resultLines.push(makeLine(code, -balance));
      result += balance;
    } else {
      assetLines.push(makeLine(code, -balance));
    }
  }
  if (result) {
    resultLines.push(makeLine(resultCode, result));
    const resultLine = assetLines.find(line => line.code === resultCode);
    const combined = (resultLine ? net(resultLine) : 0) - result;
    if (resultLine) assetLines.splice(assetLines.indexOf(resultLine), 1);
    if (combined) assetLines.push(makeLine(resultCode, combined));
  }
  return [
    {date, memo: 'Cierre de cuentas de resultados', type: 'closing-result', lines: resultLines},
    {date, memo: 'Cierre de cuentas patrimoniales', type: 'closing-assets', lines: assetLines},
    {date: nextDay(date), memo: 'Apertura del ejercicio', type: 'opening',
      lines: assetLines.map(({code, debit, credit}) => ({code, debit: credit, credit: debit}))}
  ].filter(entry => entry.lines.length);
}
