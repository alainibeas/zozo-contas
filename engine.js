export const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
export function cents(v){const s=String(v).trim().replace(/R\$/g,'').replace(/\s/g,'');if(!s)return 0;const normalized=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;if(!/^\d+(\.\d{1,2})?$/.test(normalized))throw Error('Informe um valor positivo, como 1.250,50.');const n=Math.round(Number(normalized)*100);if(!Number.isSafeInteger(n)||n>1e12)throw Error('Valor fora do limite.');return n;}
export function shiftMonth(m,n){const [y,x]=m.split('-').map(Number),d=new Date(Date.UTC(y,x-1+n,1));return d.toISOString().slice(0,7)}
export function dueDate(month,day){const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate();return `${month}-${String(Math.min(last,Math.max(1,Number(day)||1))).padStart(2,'0')}`}
export function uuid(){return crypto.randomUUID()}
export function share(item,party){return party==='a'?item.a:item.amount-item.a}
export function invoiceInfo(invoice,items){const purchases=items.filter(x=>x.kind==='purchase'&&x.card===invoice.card&&x.month===invoice.month);const detail=purchases.reduce((s,x)=>s+x.amount,0);const amount=Math.max(invoice.amount,detail);const unallocated=amount-detail;const a=purchases.reduce((s,x)=>s+x.a,0)+(invoice.payer==='a'?unallocated:0);return {...invoice,amount,a,detail,adjusted:detail>invoice.amount,purchases};}
export function monthModel(items,month,party='a'){
 const monthly=items.filter(x=>x.month===month);
 const bills=monthly.filter(x=>['expense','invoice'].includes(x.kind)).map(x=>x.kind==='invoice'?invoiceInfo(x,items):x);
 const income=monthly.filter(x=>x.kind==='income').reduce((s,x)=>s+share(x,party),0);
 const costs=bills.reduce((s,x)=>s+share(x,party),0),paid=bills.filter(x=>x.paid).reduce((s,x)=>s+share(x,party),0);
 const reserve=monthly.filter(x=>x.kind==='reserve').reduce((s,x)=>s+share(x,party),0);
 // Positive: partner owes A. Only paid bills create a reimbursement; income sharing is not an expense.
 let debtA=bills.filter(x=>x.paid).reduce((s,x)=>s+(x.payer==='a'?x.amount-x.a:-x.a),0);
 for(const x of monthly.filter(x=>x.kind==='settlement'&&x.paid))debtA+=x.payer==='a'?x.amount:-x.amount;
 return {bills,income,costs,paid,pending:costs-paid,reserve,free:income-costs,afterReserve:income-costs-reserve,debt:party==='a'?debtA:-debtA};
}
export function series(item,count,mode='repeat'){
 if(!Number.isInteger(count)||count<1||count>120)throw Error('Use de 1 a 120 meses.');
 const id=uuid();return Array.from({length:count},(_,i)=>({...item,id:uuid(),month:shiftMonth(item.month,i),due:item.due?dueDate(shiftMonth(item.month,i),Number(item.due.slice(-2))):'',paid:i===0?!!item.paid:false,series:count>1?id:null,sequence:i+1,count,seriesMode:mode,title:mode==='installment'?`${item.title} · ${i+1}/${count}`:item.title}));
}
export function validateBody(body){
 if(!body||typeof body.name!=='string'||body.name.length>80||!body.names||['a','b'].some(k=>typeof body.names[k]!=='string'||body.names[k].length>40)||!Array.isArray(body.items)||body.items.length>12000)throw Error('Backup ou dados inválidos.');
 const ids=new Set();for(const x of body.items){if(!x||typeof x.id!=='string'||ids.has(x.id)||!['card','expense','invoice','purchase','income','reserve','settlement'].includes(x.kind)||typeof x.title!=='string'||!x.title.trim()||x.title.length>150||!Number.isSafeInteger(x.amount)||x.amount<0||x.amount>1e12||!Number.isSafeInteger(x.a)||x.a<0||x.a>x.amount||!['a','b'].includes(x.payer)||typeof x.paid!=='boolean')throw Error('Lançamento inválido.');ids.add(x.id);if(x.kind!=='card'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(x.month))throw Error('Mês inválido.');if(x.due&&!/^\d{4}-\d{2}-\d{2}$/.test(x.due))throw Error('Vencimento inválido.');}
 for(const x of body.items.filter(x=>['invoice','purchase'].includes(x.kind))){if(!body.items.some(c=>c.id===x.card&&c.kind==='card'))throw Error('Cartão não encontrado.');}
 const invoices=new Set();for(const x of body.items.filter(x=>x.kind==='invoice')){const key=x.month+':'+x.card;if(invoices.has(key))throw Error('Fatura duplicada no mesmo mês.');invoices.add(key)}
 for(const p of body.items.filter(x=>x.kind==='purchase'))if(!body.items.some(x=>x.kind==='invoice'&&x.month===p.month&&x.card===p.card))throw Error('Compra sem fatura.');return body;
}
export function parseCSV(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}return rows}
// Importador específico do export Budget Alain fornecido. Somente bloco identificado 2026/2027.
// Ignora credenciais soltas, previsões antigas, checkboxes de escopo ambíguo e totais não reconciliados.
export function importBudget(text){const rows=parseCSV(text.replace(/^\uFEFF/,'')),at=i=>rows[i]||[],v=(r,c)=>{const s=at(r)[c]?.trim();if(!s||s.startsWith('#'))return 0;return s.startsWith('-')?-cents(s.slice(1)):cents(s)};
 if(at(2)[13]!=='Junho'||at(2)[17]!=='Outubro'||at(0)[13]!=='2026'||at(0)[22]!=='2027'||at(4)[1]!=='Nubank')throw Error('CSV diferente de Budget Alain. Nenhum dado foi importado.');
 const cols=[[13,'2026-06'],[14,'2026-07'],[15,'2026-08'],[16,'2026-09'],[17,'2026-10'],[19,'2026-11'],[20,'2026-12'],[22,'2027-01'],[23,'2027-02'],[24,'2027-03'],[25,'2027-04']];
 const items=[],warnings=[];let cards={};const add=(r,c,m,kind,opts={})=>{const amount=v(r,c);if(!amount)return;const x={id:uuid(),kind,title:at(r)[1].trim(),month:m,amount,a:amount,payer:'a',paid:false,due:'',category:'Outros',note:'Importado do CSV. Pagamento e vencimento a revisar.',source:`budget-alain:${r}:${m}`,...opts};items.push(x);return x};
 for(const [r,name] of [[4,'Nubank'],[21,'BV'],[25,'Inter'],[26,'Renner']]){const id=uuid();cards[r]=id;items.push({id,kind:'card',title:name,amount:0,a:0,payer:'a',paid:false,month:'',due:'',category:'Cartões',source:`budget-alain:card:${r}`})}
 for(const [c,m] of cols){
  for(const r of [4,21,25,26])add(r,c,m,'invoice',{card:cards[r],category:'Cartões'});
  const houseRows=[29,30,31,32,33,34,35,36],total=houseRows.reduce((s,r)=>s+v(r,c),0),a=v(37,c),b=v(38,c);
  if(total){let aShare=total;if(Math.abs(a+b-total)<=2)aShare=a;else warnings.push(`${m}: rateio de moradia não reconciliado; importe e revise.`);let allocated=0;const nonzero=houseRows.filter(r=>v(r,c));nonzero.forEach((r,i)=>{const value=v(r,c);const part=i===nonzero.length-1?aShare-allocated:Math.round(value*aShare/total);allocated+=part;add(r,c,m,'expense',{a:part,category:'Moradia'})})}
  add(40,c,m,'expense',{category:'Saúde'});
  for(const r of [43,44,45,46,47,48,49,50])add(r,c,m,'expense',{category:[44,45,49,50].includes(r)?'Transporte':'Outros'});
  add(56,c,m,'income',{title:'Salário líquido',category:'Receita'});add(58,c,m,'income',{title:'Bônus / férias',category:'Receita'});add(61,c,m,'reserve',{title:'Reserva planejada',category:'Reserva'});
  const computed=monthModel(items,m).free,stated=v(59,c);if(stated&&computed!==stated)warnings.push(`${m}: sobra calculada ${money(computed)}; planilha ${money(stated)}. Diferença ${money(computed-stated)} a revisar.`);
 }
 warnings.unshift('Pagamentos não foram presumidos. Defina vencimentos e confirme o histórico.','Detalhes antigos de compras dentro das faturas foram ignorados para não duplicar despesas.','Anotações inferiores sobre cartão da Gabi ficaram fora: competências e totais precisam de confirmação.');
 return {items,warnings};}
