import { neon } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");
const sql = neon(process.env.DATABASE_URL);
const [currency] = await sql.query(`SELECT c.id, c.company_id FROM currencies c WHERE c.code = 'USD' ORDER BY c.company_id LIMIT 1`, []);
if (!currency) throw new Error("No existe la moneda USD.");
const [actor] = await sql.query(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.company_id=$1 AND r.code='SUPERADMIN' AND u.status='ACTIVE' LIMIT 1`, [currency.company_id]);
if (!actor) throw new Error("No existe un SUPERADMIN activo.");

const months = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, set: 8, sep: 8, oct: 9, nov: 10, dic: 11 };
const parseDate = (name) => { const match = /^(\d{1,2})\.([A-Za-zÁÉÍÓÚáéíóú]{3})\.(\d{2,4})$/.exec(name.trim()); if (!match) return null; let year=Number(match[3]); if(year<100)year+=2000; const month=months[match[2].toLowerCase()]; return month===undefined?null:new Date(Date.UTC(year,month,Number(match[1]))); };
const dateKey = (date) => date.toISOString().slice(0, 10);
const today = new Date(); const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())); const from = new Date(to.getTime() - 90 * 86400000);
const readSeries = async (series) => { const response = await fetch(`https://estadisticas.bcrp.gob.pe/estadisticas/series/api/${series}/json/${dateKey(from)}/${dateKey(to)}`); if(!response.ok)throw new Error(`BCRP HTTP ${response.status}`); const raw=await response.text(); const cut=raw.indexOf("<"); const payload=JSON.parse((cut>=0?raw.slice(0,cut):raw).trim()); return (payload.periods??[]).map((period)=>({date:parseDate(period.name),rate:Number(period.values?.[0])})).filter((row)=>row.date&&Number.isFinite(row.rate)&&row.rate>0); };
const [sellRows,buyRows]=await Promise.all([readSeries("PD04638PD"),readSeries("PD04637PD").catch(()=>[])]); const buys=new Map(buyRows.map((row)=>[dateKey(row.date),row.rate]));
for(const row of sellRows){await sql.query(`INSERT INTO exchange_rates (id,currency_id,rate_date,rate,buy_rate,source) VALUES (gen_random_uuid(),$1,$2,$3,$4,'BCRP') ON CONFLICT (currency_id,rate_date) DO UPDATE SET rate=EXCLUDED.rate,buy_rate=EXCLUDED.buy_rate,source=EXCLUDED.source`,[currency.id,dateKey(row.date),row.rate,buys.get(dateKey(row.date))??null]);}
const latest=sellRows.at(-1); if(!latest)throw new Error("BCRP no devolvió datos.");
await sql.query(`INSERT INTO audit_logs (id,company_id,user_id,entity,entity_id,action,after_data,created_at) VALUES (gen_random_uuid(),$1,$2,'ExchangeRate',$3,'SYNC_HISTORY',$4::jsonb,now())`,[currency.company_id,actor.id,currency.id,JSON.stringify({days:90,imported:sellRows.length,source:"BCRP"})]);
console.log(`TC sincronizado: ${sellRows.length} días; fecha vigente ${dateKey(latest.date)}.`);
