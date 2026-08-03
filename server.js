const express = require("express");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

const SERVICES = [
  { id:"sports-30", nameIt:"Massaggio Sportivo", nameEn:"Sports Massage", duration:30, price:30 },
  { id:"sports-50", nameIt:"Massaggio Sportivo", nameEn:"Sports Massage", duration:50, price:50 },
  { id:"deep-30", nameIt:"Massaggio Decontratturante", nameEn:"Deep Tissue Massage", duration:30, price:30 },
  { id:"deep-50", nameIt:"Massaggio Decontratturante", nameEn:"Deep Tissue Massage", duration:50, price:50 },
  { id:"relax-30", nameIt:"Massaggio Rilassante", nameEn:"Relaxing Massage", duration:30, price:30 },
  { id:"relax-50", nameIt:"Massaggio Rilassante", nameEn:"Relaxing Massage", duration:50, price:50 }
];

const SLOTS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];
const HOURS = {0:[],1:SLOTS,2:SLOTS,3:SLOTS,4:SLOTS,5:SLOTS,6:SLOTS};

app.use(helmet({contentSecurityPolicy:{directives:{
  ...helmet.contentSecurityPolicy.getDefaultDirectives(),
  "script-src":["'self'"],"style-src":["'self'","'unsafe-inline'"],"img-src":["'self'","data:"]
}}}));
app.use(express.json({limit:"20kb"}));
app.use(express.static(path.join(__dirname,"public")));

async function init(){
  await pool.query(`CREATE TABLE IF NOT EXISTS bookings(
    id UUID PRIMARY KEY, service_id VARCHAR(80) NOT NULL, service_name VARCHAR(120) NOT NULL,
    duration_minutes INTEGER NOT NULL, price_eur NUMERIC(8,2) NOT NULL,
    appointment_date DATE NOT NULL, appointment_time TIME NOT NULL,
    customer_name VARCHAR(120) NOT NULL, customer_email VARCHAR(180) NOT NULL,
    customer_phone VARCHAR(40) NOT NULL, notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(appointment_date, appointment_time)
  )`);
}
const clean=(v,n=300)=>String(v||"").trim().slice(0,n);
const validEmail=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d);
const dateObj=d=>{const [y,m,day]=d.split("-").map(Number);return new Date(y,m-1,day)};

app.get("/api/services",(_q,r)=>r.json(SERVICES));
app.get("/api/availability",async(req,res)=>{
  const date=clean(req.query.date,10);
  if(!validDate(date)) return res.status(400).json({error:"Invalid date"});
  const d=dateObj(date),today=new Date();today.setHours(0,0,0,0);
  if(d<today) return res.json({slots:[]});
  const result=await pool.query(
    `SELECT TO_CHAR(appointment_time,'HH24:MI') time FROM bookings
     WHERE appointment_date=$1 AND status<>'cancelled'`,[date]);
  const booked=new Set(result.rows.map(x=>x.time));
  res.json({slots:(HOURS[d.getDay()]||[]).filter(x=>!booked.has(x))});
});

app.post("/api/bookings",async(req,res)=>{
  const lang=req.body.language==="en"?"en":"it";
  const service=SERVICES.find(s=>s.id===clean(req.body.serviceId,80));
  const date=clean(req.body.date,10),time=clean(req.body.time,5),
    name=clean(req.body.name,120),email=clean(req.body.email,180).toLowerCase(),
    phone=clean(req.body.phone,40),notes=clean(req.body.notes,1000);
  const invalid=lang==="it"?"Controlla i dati inseriti.":"Please check the information entered.";
  if(!service||!validDate(date)||!/^\d{2}:\d{2}$/.test(time)||name.length<2||!validEmail(email)||phone.length<6)
    return res.status(400).json({error:invalid});
  if(req.body.privacyAccepted!==true)
    return res.status(400).json({error:lang==="it"?"Accetta il consenso privacy.":"Privacy consent is required."});
  const d=dateObj(date),today=new Date();today.setHours(0,0,0,0);
  if(d<today||!(HOURS[d.getDay()]||[]).includes(time)) return res.status(400).json({error:invalid});
  const id=crypto.randomUUID(),serviceName=lang==="it"?service.nameIt:service.nameEn;
  try{
    await pool.query(`INSERT INTO bookings(id,service_id,service_name,duration_minutes,price_eur,
      appointment_date,appointment_time,customer_name,customer_email,customer_phone,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id,service.id,serviceName,service.duration,service.price,date,time,name,email,phone,notes||null]);
    res.status(201).json({message:lang==="it"?"Prenotazione confermata.":"Appointment confirmed.",booking:{id}});
  }catch(e){
    if(e.code==="23505") return res.status(409).json({error:lang==="it"?"Orario appena occupato. Scegline un altro.":"That time was just booked."});
    console.error(e);res.status(500).json({error:invalid});
  }
});

function admin(req){
  const auth=req.headers.authorization||"";
  if(!auth.startsWith("Basic ")) return false;
  const [u="",p=""]=Buffer.from(auth.slice(6),"base64").toString().split(":");
  return u===(process.env.ADMIN_USERNAME||"admin") && p===process.env.ADMIN_PASSWORD;
}
function protect(req,res,next){
  if(!admin(req)){res.set("WWW-Authenticate",'Basic realm="Studio Massage Admin"');return res.status(401).send("Authentication required.");}
  next();
}
app.get("/admin",protect,(_q,r)=>r.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/api/admin/bookings",protect,async(_q,r)=>{
 const x=await pool.query(`SELECT id,service_name,duration_minutes,price_eur,
 TO_CHAR(appointment_date,'YYYY-MM-DD') appointment_date,
 TO_CHAR(appointment_time,'HH24:MI') appointment_time,
 customer_name,customer_email,customer_phone,notes,status
 FROM bookings ORDER BY appointment_date,appointment_time`);
 r.json(x.rows);
});
app.patch("/api/admin/bookings/:id/status",protect,async(req,res)=>{
 const status=clean(req.body.status,20);
 if(!["confirmed","completed","cancelled"].includes(status)) return res.status(400).json({error:"Invalid status"});
 await pool.query("UPDATE bookings SET status=$1 WHERE id=$2",[status,req.params.id]);
 res.json({ok:true});
});
app.get("/health",(_q,r)=>r.json({status:"ok"}));
init().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log(`Running on ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
