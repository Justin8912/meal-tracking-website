import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ─── INGREDIENT DATABASE (nutrition per 100g, vitamins as %DV) ────────────
const INGR_DB = [
  { id:"chicken-breast", name:"Chicken Breast", cat:"protein", uw:170, n:{cal:165,p:31,c:0,f:3.6,fb:0}, v:{"B6":25,"Niacin":50,"B12":5,"Selenium":40,"Zinc":8} },
  { id:"salmon", name:"Salmon Fillet", cat:"protein", uw:170, n:{cal:208,p:20,c:0,f:13,fb:0}, v:{"D":65,"B12":80,"Omega-3":180,"Selenium":55,"Niacin":40} },
  { id:"ground-beef", name:"Ground Beef (90/10)", cat:"protein", uw:113, n:{cal:176,p:26,c:0,f:8,fb:0}, v:{"B12":45,"Zinc":35,"Iron":15,"Niacin":25,"B6":20} },
  { id:"eggs", name:"Eggs", cat:"protein", uw:50, n:{cal:155,p:13,c:1.1,f:11,fb:0}, v:{"B12":20,"D":10,"A":10,"Selenium":28,"Riboflavin":25} },
  { id:"shrimp", name:"Shrimp", cat:"protein", uw:8, n:{cal:99,p:24,c:0.2,f:0.3,fb:0}, v:{"B12":30,"Selenium":55,"Niacin":25,"Iron":10,"Zinc":10} },
  { id:"tofu", name:"Tofu (firm)", cat:"protein", uw:85, n:{cal:76,p:8,c:1.9,f:4.8,fb:0.3}, v:{"Calcium":35,"Iron":15,"Manganese":30,"Selenium":15,"Copper":10} },
  { id:"turkey", name:"Ground Turkey", cat:"protein", uw:113, n:{cal:170,p:21,c:0,f:9.4,fb:0}, v:{"B6":20,"Niacin":30,"Selenium":25,"Zinc":15,"B12":10} },
  { id:"rice", name:"White Rice (cooked)", cat:"grain", uw:185, n:{cal:130,p:2.7,c:28,f:0.3,fb:0.4}, v:{"Manganese":18,"Thiamine":10,"Folate":8,"Iron":5,"Niacin":8} },
  { id:"brown-rice", name:"Brown Rice (cooked)", cat:"grain", uw:195, n:{cal:123,p:2.7,c:26,f:1,fb:1.6}, v:{"Manganese":40,"Selenium":15,"Magnesium":10,"B6":10,"Thiamine":10} },
  { id:"pasta", name:"Pasta (cooked)", cat:"grain", uw:140, n:{cal:131,p:5,c:25,f:1.1,fb:1.8}, v:{"Thiamine":15,"Folate":10,"Manganese":12,"Iron":8,"Selenium":18} },
  { id:"oats", name:"Rolled Oats (dry)", cat:"grain", uw:40, n:{cal:389,p:17,c:66,f:7,fb:10}, v:{"Manganese":75,"Thiamine":30,"Iron":20,"Magnesium":18,"Zinc":15} },
  { id:"bread", name:"Sourdough Bread", cat:"grain", uw:30, n:{cal:265,p:9,c:49,f:3.2,fb:2.4}, v:{"Folate":18,"Thiamine":20,"Iron":12,"Niacin":15,"Manganese":15} },
  { id:"quinoa", name:"Quinoa (cooked)", cat:"grain", uw:185, n:{cal:120,p:4.4,c:21,f:1.9,fb:2.8}, v:{"Manganese":28,"Magnesium":15,"Folate":10,"Iron":8,"B6":8} },
  { id:"tortilla", name:"Flour Tortilla", cat:"grain", uw:45, n:{cal:312,p:8,c:52,f:8,fb:2.2}, v:{"Thiamine":20,"Iron":15,"Folate":12,"Niacin":10,"Calcium":8} },
  { id:"broccoli", name:"Broccoli", cat:"vegetable", uw:150, n:{cal:34,p:2.8,c:7,f:0.4,fb:2.6}, v:{"C":90,"K":85,"A":12,"Folate":15,"B6":10} },
  { id:"spinach", name:"Spinach", cat:"vegetable", uw:30, n:{cal:23,p:2.9,c:3.6,f:0.4,fb:2.2}, v:{"K":460,"A":190,"C":45,"Folate":50,"Manganese":45} },
  { id:"sweet-potato", name:"Sweet Potato", cat:"vegetable", uw:130, n:{cal:86,p:1.6,c:20,f:0.1,fb:3}, v:{"A":180,"C":4,"Manganese":13,"B6":10,"Potassium":10} },
  { id:"bell-pepper", name:"Bell Pepper", cat:"vegetable", uw:150, n:{cal:31,p:1,c:6,f:0.3,fb:2.1}, v:{"C":210,"A":35,"B6":15,"Folate":12,"E":10} },
  { id:"tomato", name:"Tomato", cat:"vegetable", uw:150, n:{cal:18,p:0.9,c:3.9,f:0.2,fb:1.2}, v:{"C":20,"A":15,"K":10,"Potassium":7,"Folate":4} },
  { id:"avocado", name:"Avocado", cat:"vegetable", uw:150, n:{cal:160,p:2,c:9,f:15,fb:7}, v:{"K":32,"E":18,"C":12,"B6":15,"Folate":20} },
  { id:"greek-yogurt", name:"Greek Yogurt", cat:"dairy", uw:170, n:{cal:59,p:10,c:3.6,f:0.4,fb:0}, v:{"Calcium":30,"B12":20,"Riboflavin":18,"D":5,"Phosphorus":25} },
  { id:"cheddar", name:"Cheddar Cheese", cat:"dairy", uw:28, n:{cal:403,p:25,c:1.3,f:33,fb:0}, v:{"Calcium":70,"A":20,"B12":15,"Phosphorus":40,"Zinc":15} },
  { id:"feta", name:"Feta Cheese", cat:"dairy", uw:28, n:{cal:264,p:14,c:4.1,f:21,fb:0}, v:{"Calcium":50,"B12":15,"Riboflavin":20,"A":8,"Phosphorus":30} },
  { id:"olive-oil", name:"Olive Oil", cat:"fat", uw:14, n:{cal:884,p:0,c:0,f:100,fb:0}, v:{"E":72,"K":50} },
  { id:"black-beans", name:"Black Beans (cooked)", cat:"legume", uw:130, n:{cal:132,p:9,c:24,f:0.5,fb:8.7}, v:{"Folate":32,"Iron":12,"Manganese":20,"Thiamine":15,"Magnesium":15} },
  { id:"banana", name:"Banana", cat:"fruit", uw:120, n:{cal:89,p:1.1,c:23,f:0.3,fb:2.6}, v:{"B6":20,"C":12,"Manganese":13,"Potassium":10,"Magnesium":7} },
  { id:"honey", name:"Honey", cat:"condiment", uw:21, n:{cal:304,p:0.3,c:82,f:0,fb:0}, v:{} },
  { id:"garlic", name:"Garlic", cat:"condiment", uw:3, n:{cal:149,p:6.4,c:33,f:0.5,fb:2.1}, v:{"B6":60,"C":35,"Manganese":40,"Selenium":15} },
  { id:"lemon", name:"Lemon", cat:"fruit", uw:60, n:{cal:29,p:1.1,c:9,f:0.3,fb:2.8}, v:{"C":64,"B6":5,"Folate":3} },
];

const DEFAULT_TAGS = ["gluten-free","dairy-free","vegan","vegetarian","keto","high-protein","low-carb","meal-prep","quick","comfort-food"];
const MEAL_TYPES = ["breakfast","lunch","dinner","snack"];
const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const UNITS = [{id:"g",label:"g",grams:1},{id:"tsp",label:"tsp",grams:5},{id:"tbsp",label:"tbsp",grams:15},{id:"fl oz",label:"fl oz",grams:30},{id:"cup",label:"cup",grams:240},{id:"quart",label:"quart",grams:960},{id:"qty",label:"qty",grams:null}];

// ─── HELPERS ──────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2,10);
const getWeekKey = (offset) => {
  const d = new Date(); d.setDate(d.getDate() - ((d.getDay()||7)-1) + offset*7);
  return `${d.getFullYear()}-W${String(Math.ceil(((d - new Date(d.getFullYear(),0,1))/86400000+1)/7)).padStart(2,'0')}`;
};
const getWeekDates = (offset) => {
  const now = new Date(), day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - (day===0?6:day-1) + offset*7);
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});
};
const toGrams = (amount, unit, dbItem) => {
  if(unit==="qty" && dbItem) return amount * (dbItem.uw||100);
  const u = UNITS.find(u=>u.id===unit);
  return amount * (u?.grams||1);
};
const calcRecipeNutrition = (ingredients, servings=1) => {
  const t = {cal:0,p:0,c:0,f:0,fb:0};
  const vt = {};
  ingredients.forEach(ing => {
    if(ing.isCustom && ing.customNutrition) {
      t.cal+=ing.customNutrition.cal||0; t.p+=ing.customNutrition.p||0;
      t.c+=ing.customNutrition.c||0; t.f+=ing.customNutrition.f||0; t.fb+=ing.customNutrition.fb||0;
    } else {
      const db = INGR_DB.find(d=>d.id===ing.dbId);
      if(db){
        const grams = toGrams(ing.amount||0, ing.unit||"g", db);
        const mult = grams/100;
        t.cal+=db.n.cal*mult; t.p+=db.n.p*mult; t.c+=db.n.c*mult; t.f+=db.n.f*mult; t.fb+=db.n.fb*mult;
        Object.entries(db.v).forEach(([k,v])=>{vt[k]=(vt[k]||0)+v*mult;});
      }
    }
  });
  const s = Math.max(servings,1);
  return { total:t, perServing:{cal:Math.round(t.cal/s),p:Math.round(t.p/s),c:Math.round(t.c/s),f:Math.round(t.f/s),fb:Math.round(t.fb/s)}, vitamins:Object.fromEntries(Object.entries(vt).map(([k,v])=>[k,Math.round(v/s)+"%"])) };
};

// ─── DEFAULT RECIPES ──────────────────────────────────────────────────────
const makeDefaultRecipes = () => [
  { id:uid(), name:"Avocado & Poached Eggs on Sourdough", type:"breakfast", servings:1,
    ingredients:[
      {id:uid(),dbId:"eggs",name:"Eggs",amount:100,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"avocado",name:"Avocado",amount:80,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"bread",name:"Sourdough Bread",amount:60,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"lemon",name:"Lemon",amount:10,unit:"g",isCustom:false,customNutrition:null,tags:[]},
    ], notes:"Poach eggs for 3 minutes. Smash avocado with lemon and chili flakes.", link:"", tags:["quick","vegetarian"]},
  { id:uid(), name:"Greek Yogurt Parfait", type:"breakfast", servings:1,
    ingredients:[
      {id:uid(),dbId:"greek-yogurt",name:"Greek Yogurt",amount:200,unit:"g",isCustom:false,customNutrition:null,tags:["dairy"]},
      {id:uid(),dbId:"oats",name:"Rolled Oats (dry)",amount:30,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"banana",name:"Banana",amount:80,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"honey",name:"Honey",amount:15,unit:"g",isCustom:false,customNutrition:null,tags:[]},
    ], notes:"Layer yogurt, granola and fruit. Drizzle honey on top.", link:"", tags:["quick","vegetarian"]},
  { id:uid(), name:"Mediterranean Chicken Bowl", type:"lunch", servings:2,
    ingredients:[
      {id:uid(),dbId:"chicken-breast",name:"Chicken Breast",amount:300,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"brown-rice",name:"Brown Rice (cooked)",amount:300,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"tomato",name:"Tomato",amount:100,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"feta",name:"Feta Cheese",amount:40,unit:"g",isCustom:false,customNutrition:null,tags:["dairy"]},
      {id:uid(),dbId:"olive-oil",name:"Olive Oil",amount:15,unit:"g",isCustom:false,customNutrition:null,tags:[]},
    ], notes:"Grill chicken with oregano and lemon. Serve over rice with fresh veggies and tzatziki.", link:"", tags:["high-protein","meal-prep"]},
  { id:uid(), name:"Asian Salmon Salad", type:"lunch", servings:1,
    ingredients:[
      {id:uid(),dbId:"salmon",name:"Salmon Fillet",amount:130,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"spinach",name:"Spinach",amount:80,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"avocado",name:"Avocado",amount:60,unit:"g",isCustom:false,customNutrition:null,tags:[]},
    ], notes:"Pan-sear salmon, serve on mixed greens with sesame dressing.", link:"", tags:["high-protein","keto"]},
  { id:uid(), name:"Beef Stir-Fry with Broccoli", type:"dinner", servings:2,
    ingredients:[
      {id:uid(),dbId:"ground-beef",name:"Ground Beef (90/10)",amount:300,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"broccoli",name:"Broccoli",amount:200,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"rice",name:"White Rice (cooked)",amount:300,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"garlic",name:"Garlic",amount:10,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"olive-oil",name:"Olive Oil",amount:10,unit:"g",isCustom:false,customNutrition:null,tags:[]},
    ], notes:"Stir-fry beef with garlic and soy sauce, add broccoli last to keep it crisp.", link:"", tags:["high-protein","meal-prep"]},
  { id:uid(), name:"Lemon Pasta with Shrimp", type:"dinner", servings:2,
    ingredients:[
      {id:uid(),dbId:"shrimp",name:"Shrimp",amount:200,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"pasta",name:"Pasta (cooked)",amount:300,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"lemon",name:"Lemon",amount:30,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"garlic",name:"Garlic",amount:10,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"olive-oil",name:"Olive Oil",amount:15,unit:"g",isCustom:false,customNutrition:null,tags:[]},
    ], notes:"Sauté shrimp with garlic, toss with pasta, lemon zest and parmesan.", link:"", tags:["quick","comfort-food"]},
  { id:uid(), name:"Stuffed Bell Peppers", type:"dinner", servings:4,
    ingredients:[
      {id:uid(),dbId:"bell-pepper",name:"Bell Pepper",amount:400,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"turkey",name:"Ground Turkey",amount:400,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"quinoa",name:"Quinoa (cooked)",amount:200,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"black-beans",name:"Black Beans (cooked)",amount:150,unit:"g",isCustom:false,customNutrition:null,tags:[]},
      {id:uid(),dbId:"cheddar",name:"Cheddar Cheese",amount:60,unit:"g",isCustom:false,customNutrition:null,tags:["dairy"]},
    ], notes:"Hollow out peppers, stuff with turkey-quinoa mix, top with cheese, bake 25min at 375°F.", link:"", tags:["meal-prep","high-protein"]},
];

// ─── STYLE CONSTANTS ──────────────────────────────────────────────────────
const C = {bg:"#f5f1eb",card:"#fff",cardAlt:"#faf8f4",chipBg:"#ede8df",dark:"#3a3428",med:"#5c5549",muted:"#7a7264",light:"#a09888",border:"#e8e2d8",borderLight:"#ddd8ce",protein:"#c47a5a",carbs:"#d4a96a",fat:"#8aab7f",fiber:"#7a9eb5",danger:"#c45a5a",success:"#6a9e5a"};
const font = (s,w=400,c=C.dark) => ({fontFamily:"'DM Sans', sans-serif",fontSize:s,fontWeight:w,color:c});
const heading = (s,w=500,c=C.dark) => ({fontFamily:"'Playfair Display', serif",fontSize:s,fontWeight:w,color:c});
const pill = (active,accent=C.dark) => ({...font(12,active?600:400,active?C.bg:C.muted),padding:"6px 16px",border:`1.5px solid ${active?accent:C.borderLight}`,borderRadius:24,cursor:"pointer",textTransform:"capitalize",background:active?accent:"transparent",transition:"all 0.2s"});
const inputStyle = {...font(13),padding:"8px 12px",border:`1.5px solid ${C.borderLight}`,borderRadius:8,outline:"none",background:C.cardAlt,color:C.dark,width:"100%",transition:"border 0.2s"};
const btnPrimary = {...font(13,600,"#fff"),padding:"10px 20px",background:C.dark,border:"none",borderRadius:8,cursor:"pointer"};
const btnSecondary = {...font(13,500,C.muted),padding:"10px 20px",background:"transparent",border:`1.5px solid ${C.borderLight}`,borderRadius:8,cursor:"pointer"};

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────
const MacroBar = ({label,value,max,color}) => (
  <div style={{flex:1}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,...font(11,400,"#8a8172"),letterSpacing:"0.04em",textTransform:"uppercase"}}>
      <span>{label}</span><span style={{color:C.med,fontWeight:600}}>{value}g</span>
    </div>
    <div style={{height:6,background:C.chipBg,borderRadius:3,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${Math.min((value/max)*100,100)}%`,background:color,borderRadius:3,transition:"width 0.6s cubic-bezier(.4,0,.2,1)"}}/>
    </div>
  </div>
);

const TagChip = ({label,onRemove,small}) => (
  <span style={{...font(small?10:12,500,C.med),background:C.chipBg,padding:small?"2px 8px":"4px 12px",borderRadius:20,display:"inline-flex",alignItems:"center",gap:4}}>
    {label}{onRemove&&<span onClick={onRemove} style={{cursor:"pointer",fontSize:small?12:14,lineHeight:1,color:C.light,marginLeft:2}}>×</span>}
  </span>
);

const Overlay = ({children,onClose}) => (
  <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(58,52,40,0.4)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:40,overflowY:"auto"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:12,width:"90%",maxWidth:800,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(58,52,40,0.2)"}}>{children}</div>
  </div>
);

const EmptyState = ({emoji,title,sub}) => (
  <div style={{padding:60,textAlign:"center",color:C.light}}>
    <div style={{fontSize:40,marginBottom:12}}>{emoji}</div>
    <div style={{...heading(18,500,C.muted)}}>{title}</div>
    {sub&&<div style={{...font(13),marginTop:4,color:C.light}}>{sub}</div>}
  </div>
);

// ─── RECIPE FORM MODAL ───────────────────────────────────────────────────
const RecipeModal = ({recipe,onSave,onClose}) => {
  const [form,setForm] = useState(recipe || {id:uid(),name:"",type:"dinner",servings:1,ingredients:[],notes:"",link:"",tags:[]});
  const [ingrSearch,setIngrSearch] = useState("");
  const [showIngrDrop,setShowIngrDrop] = useState(false);
  const [tagInput,setTagInput] = useState("");
  const searchRef = useRef(null);
  const filteredIngr = ingrSearch.length>0 ? INGR_DB.filter(i=>i.name.toLowerCase().includes(ingrSearch.toLowerCase()) && !form.ingredients.some(fi=>fi.dbId===i.id)) : [];
  const nutrition = calcRecipeNutrition(form.ingredients, form.servings);

  const addIngredient = (dbItem) => {
    setForm(f=>({...f,ingredients:[...f.ingredients,{id:uid(),dbId:dbItem.id,name:dbItem.name,amount:1,unit:"g",isCustom:false,customNutrition:null,tags:[]}]}));
    setIngrSearch(""); setShowIngrDrop(false);
  };
  const addCustomIngredient = () => {
    setForm(f=>({...f,ingredients:[...f.ingredients,{id:uid(),dbId:null,name:"",amount:1,unit:"g",isCustom:true,customNutrition:{cal:0,p:0,c:0,f:0,fb:0},tags:[]}]}));
  };
  const updateIngr = (idx,patch) => setForm(f=>({...f,ingredients:f.ingredients.map((ing,i)=>i===idx?{...ing,...patch}:ing)}));
  const removeIngr = (idx) => setForm(f=>({...f,ingredients:f.ingredients.filter((_,i)=>i!==idx)}));
  const addTag = () => {if(tagInput.trim()&&!form.tags.includes(tagInput.trim().toLowerCase())){setForm(f=>({...f,tags:[...f.tags,tagInput.trim().toLowerCase()]}));setTagInput("");}};

  return (
    <Overlay onClose={onClose}>
      <div style={{padding:"24px 28px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={heading(22,600)}>{recipe?"Edit Recipe":"New Recipe"}</div>
        <span onClick={onClose} style={{cursor:"pointer",...font(22,300,C.light)}}>×</span>
      </div>
      <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:20}}>
        {/* Basic Info Row */}
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Recipe Name</div>
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Grilled Chicken Bowl" style={inputStyle} />
          </div>
          <div style={{flex:"0 0 130px"}}>
            <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Meal Type</div>
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={{...inputStyle,cursor:"pointer"}}>
              {MEAL_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select>
          </div>
          <div style={{flex:"0 0 80px"}}>
            <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Servings</div>
            <input type="number" min={1} value={form.servings} onChange={e=>setForm(f=>({...f,servings:Math.max(1,parseInt(e.target.value)||1)}))} style={{...inputStyle,textAlign:"center"}} />
          </div>
        </div>
        {/* Ingredients Section */}
        <div>
          <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Ingredients</div>
          <div style={{position:"relative",marginBottom:12,display:"flex",gap:8}}>
            <div style={{flex:1,position:"relative"}} ref={searchRef}>
              <input value={ingrSearch} onChange={e=>{setIngrSearch(e.target.value);setShowIngrDrop(true);}} onFocus={()=>setShowIngrDrop(true)} placeholder="Search ingredient database…" style={inputStyle} />
              {showIngrDrop && filteredIngr.length>0 && (
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,marginTop:4,maxHeight:200,overflowY:"auto",zIndex:10,boxShadow:"0 8px 24px rgba(58,52,40,0.12)"}}>
                  {filteredIngr.slice(0,8).map(item=>(
                    <div key={item.id} onClick={()=>addIngredient(item)} style={{padding:"10px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.chipBg}`,...font(13)}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.cardAlt} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span>{item.name} <span style={{...font(11,400,C.light),textTransform:"capitalize"}}>{item.cat}</span></span>
                      <span style={{...font(11,500,C.light)}}>{item.n.cal} cal/100g</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={addCustomIngredient} style={{...btnSecondary,whiteSpace:"nowrap",padding:"8px 14px",...font(12,500,C.muted)}}>+ Custom</button>
          </div>
          {form.ingredients.length===0 && <div style={{...font(13,400,C.light),padding:"16px 0",textAlign:"center",background:C.cardAlt,borderRadius:8}}>No ingredients yet. Search above or add a custom ingredient.</div>}
          {form.ingredients.map((ing,idx)=>(
            <div key={ing.id} style={{padding:12,marginBottom:8,background:C.cardAlt,borderRadius:8,border:`1px solid ${C.chipBg}`}}>
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                {ing.isCustom ? (
                  <input value={ing.name} onChange={e=>updateIngr(idx,{name:e.target.value})} placeholder="Ingredient name" style={{...inputStyle,flex:1,minWidth:150,background:C.card}} />
                ) : (
                  <span style={{...font(14,500),flex:1,minWidth:150}}>{ing.name}</span>
                )}
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input type="number" value={ing.amount} onChange={e=>updateIngr(idx,{amount:Math.max(0,parseFloat(e.target.value)||0)})} style={{...inputStyle,width:70,textAlign:"center",background:C.card}} />
                  <select value={ing.unit||"g"} onChange={e=>updateIngr(idx,{unit:e.target.value})} style={{...inputStyle,width:78,padding:"8px 4px",cursor:"pointer",background:C.card}}>
                    {UNITS.map(u=><option key={u.id} value={u.id}>{u.label}</option>)}
                  </select>
                </div>
                {!ing.isCustom && (()=>{const db=INGR_DB.find(d=>d.id===ing.dbId); if(!db)return null; const g=toGrams(ing.amount,ing.unit||"g",db); const m=g/100; return <span style={font(11,400,C.light)}>{Math.round(db.n.cal*m)} cal · {Math.round(db.n.p*m)}p · {Math.round(db.n.c*m)}c · {Math.round(db.n.f*m)}f</span>;})()}
                <span onClick={()=>removeIngr(idx)} style={{cursor:"pointer",...font(18,300,C.light),lineHeight:1}}>×</span>
              </div>
              {ing.isCustom && (
                <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                  {[["cal","Calories"],["p","Protein (g)"],["c","Carbs (g)"],["f","Fat (g)"],["fb","Fiber (g)"]].map(([k,label])=>(
                    <div key={k} style={{flex:"1 0 80px"}}>
                      <div style={{...font(10,500,C.light),marginBottom:3}}>{label}</div>
                      <input type="number" value={ing.customNutrition?.[k]||0} onChange={e=>updateIngr(idx,{customNutrition:{...ing.customNutrition,[k]:parseFloat(e.target.value)||0}})} style={{...inputStyle,fontSize:12,padding:"5px 8px",background:C.card,textAlign:"center"}} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {form.ingredients.length>0 && (
            <div style={{padding:14,background:C.dark,borderRadius:8,marginTop:8}}>
              <div style={{...font(10,600,"rgba(255,255,255,0.5)"),textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Nutrition per Serving</div>
              <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                {[["Calories",nutrition.perServing.cal,"kcal",C.bg],["Protein",nutrition.perServing.p,"g",C.protein],["Carbs",nutrition.perServing.c,"g",C.carbs],["Fat",nutrition.perServing.f,"g",C.fat],["Fiber",nutrition.perServing.fb,"g",C.fiber]].map(([l,v,u,c])=>(
                  <div key={l}><div style={{...heading(20,600,c)}}>{v}</div><div style={{...font(10,400,"rgba(255,255,255,0.4)")}}>{u} {l.toLowerCase()}</div></div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Tags */}
        <div>
          <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Tags</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
            {DEFAULT_TAGS.map(t=>(<span key={t} onClick={()=>setForm(f=>({...f,tags:f.tags.includes(t)?f.tags.filter(x=>x!==t):[...f.tags,t]}))} style={{...pill(form.tags.includes(t)),fontSize:11,padding:"4px 12px"}}>{t}</span>))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTag()} placeholder="Add custom tag…" style={{...inputStyle,flex:1}} />
            <button onClick={addTag} style={{...btnSecondary,padding:"8px 14px"}}>Add</button>
          </div>
          {form.tags.length>0 && <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:8}}>{form.tags.map(t=><TagChip key={t} label={t} onRemove={()=>setForm(f=>({...f,tags:f.tags.filter(x=>x!==t)}))} />)}</div>}
        </div>
        {/* Notes & Link */}
        <div style={{display:"flex",gap:16}}>
          <div style={{flex:1}}>
            <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Notes</div>
            <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Cooking tips, variations…" style={{...inputStyle,resize:"vertical"}} />
          </div>
          <div style={{flex:1}}>
            <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Recipe Link</div>
            <input value={form.link} onChange={e=>setForm(f=>({...f,link:e.target.value}))} placeholder="https://..." style={inputStyle} />
          </div>
        </div>
      </div>
      <div style={{padding:"16px 28px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end",gap:10}}>
        <button onClick={onClose} style={btnSecondary}>Cancel</button>
        <button onClick={()=>{if(form.name.trim())onSave(form);}} style={{...btnPrimary,opacity:form.name.trim()?1:0.5}}>Save Recipe</button>
      </div>
    </Overlay>
  );
};

// ─── ADD MEAL TO PLANNER MODAL ────────────────────────────────────────────
const AddMealModal = ({recipes,onAddRecipe,onAddCustom,onClose}) => {
  const [mode,setMode] = useState("recipe");
  const [search,setSearch] = useState("");
  const [custom,setCustom] = useState({title:"",description:"",link:""});
  const filtered = recipes.filter(r=>r.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Overlay onClose={onClose}>
      <div style={{padding:"24px 28px",borderBottom:`1px solid ${C.border}`}}>
        <div style={heading(20,600)}>Add Meal</div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button onClick={()=>setMode("recipe")} style={pill(mode==="recipe")}>From Recipes</button>
          <button onClick={()=>setMode("custom")} style={pill(mode==="custom")}>Custom Meal</button>
        </div>
      </div>
      <div style={{padding:"20px 28px",minHeight:200}}>
        {mode==="recipe" ? (<>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search recipes…" style={{...inputStyle,marginBottom:12}} />
          <div style={{maxHeight:300,overflowY:"auto"}}>
            {filtered.map(r=>{const n=calcRecipeNutrition(r.ingredients,r.servings); return (
              <div key={r.id} onClick={()=>onAddRecipe(r.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",cursor:"pointer",borderRadius:8,marginBottom:4,...font(14)}}
                onMouseEnter={e=>e.currentTarget.style.background=C.cardAlt} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{flex:1}}>
                  <div style={font(14,500)}>{r.name}</div>
                  <div style={font(11,400,C.light)}>{r.type} · {n.perServing.cal} kcal · {r.servings} serving{r.servings>1?"s":""}</div>
                </div>
              </div>
            );})}
            {filtered.length===0 && <EmptyState emoji="🔍" title="No recipes found" />}
          </div>
        </>) : (<>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div><div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Meal Title</div><input value={custom.title} onChange={e=>setCustom(c=>({...c,title:e.target.value}))} placeholder="e.g. Takeout Thai" style={inputStyle}/></div>
            <div><div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Description</div><textarea value={custom.description} onChange={e=>setCustom(c=>({...c,description:e.target.value}))} rows={2} placeholder="Optional notes…" style={{...inputStyle,resize:"vertical"}}/></div>
            <div><div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Link</div><input value={custom.link} onChange={e=>setCustom(c=>({...c,link:e.target.value}))} placeholder="https://..." style={inputStyle}/></div>
            <button onClick={()=>{if(custom.title.trim())onAddCustom(custom);}} style={{...btnPrimary,alignSelf:"flex-end",opacity:custom.title.trim()?1:0.5}}>Add Meal</button>
          </div>
        </>)}
      </div>
    </Overlay>
  );
};

// ─── MEAL DETAIL POPOVER ──────────────────────────────────────────────────
const MealDetailModal = ({entry,recipes,onClose}) => {
  const recipe = entry.recipeId ? recipes.find(r=>r.id===entry.recipeId) : null;
  const nutrition = recipe ? calcRecipeNutrition(recipe.ingredients,recipe.servings) : null;
  return (
    <Overlay onClose={onClose}>
      <div style={{padding:"28px"}}>
        {recipe ? (<>
          <div style={{marginBottom:20}}>
            <div style={heading(22,600)}>{recipe.name}</div><div style={{...font(13,400,C.light),textTransform:"capitalize",marginTop:4}}>{recipe.type} · {recipe.servings} serving{recipe.servings>1?"s":""}</div>
          </div>
          {nutrition && (<div style={{display:"flex",gap:20,marginBottom:20}}>
            <MacroBar label="Protein" value={nutrition.perServing.p} max={50} color={C.protein}/>
            <MacroBar label="Carbs" value={nutrition.perServing.c} max={70} color={C.carbs}/>
            <MacroBar label="Fat" value={nutrition.perServing.f} max={40} color={C.fat}/>
            <MacroBar label="Fiber" value={nutrition.perServing.fb} max={15} color={C.fiber}/>
          </div>)}
          {Object.keys(nutrition.vitamins).length>0 && (<div style={{marginBottom:20}}>
            <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Vitamins & Minerals (per serving)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"4px 20px"}}>
              {Object.entries(nutrition.vitamins).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",...font(12)}}><span style={{color:C.muted}}>{k}</span><span style={{fontWeight:600,color:C.med}}>{v}</span></div>)}
            </div>
          </div>)}
          {recipe.notes && <div style={{marginBottom:16}}><div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Notes</div><div style={{...font(13,400,C.med),lineHeight:1.6,background:C.cardAlt,padding:14,borderRadius:8}}>{recipe.notes}</div></div>}
          {recipe.link && <a href={recipe.link} target="_blank" rel="noopener noreferrer" style={{...font(13,500,C.protein),textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4}}>View Full Recipe ↗</a>}
          {recipe.tags.length>0 && <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:12}}>{recipe.tags.map(t=><TagChip key={t} label={t} small/>)}</div>}
        </>) : (<>
          <div style={heading(22,600)}>{entry.customTitle}</div>
          {entry.customDescription && <div style={{...font(14,400,C.med),marginTop:12,lineHeight:1.6}}>{entry.customDescription}</div>}
          {entry.customLink && <a href={entry.customLink} target="_blank" rel="noopener noreferrer" style={{...font(13,500,C.protein),textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4,marginTop:12}}>View Recipe ↗</a>}
        </>)}
      </div>
      <div style={{padding:"14px 28px",borderTop:`1px solid ${C.border}`,textAlign:"right"}}>
        <button onClick={onClose} style={btnSecondary}>Close</button>
      </div>
    </Overlay>
  );
};

// ─── MEAL LIBRARY VIEW ────────────────────────────────────────────────────
const MealLibrary = ({recipes,onAdd,onEdit,onDelete}) => {
  const [expandedId,setExpandedId] = useState(null);
  const [filter,setFilter] = useState("all");
  const [tagFilter,setTagFilter] = useState(null);
  const [search,setSearch] = useState("");
  const [confirmDelete,setConfirmDelete] = useState(null);

  const allTags = [...new Set(recipes.flatMap(r=>r.tags))].sort();
  const filtered = recipes.filter(r=>{
    if(filter!=="all"&&r.type!==filter) return false;
    if(tagFilter&&!r.tags.includes(tagFilter)) return false;
    if(search){const q=search.toLowerCase();if(!r.name.toLowerCase().includes(q)&&!r.ingredients.some(i=>i.name.toLowerCase().includes(q)))return false;}
    return true;
  });

  return (
    <div style={{background:C.card,borderRadius:"0 8px 8px 8px",boxShadow:"0 2px 20px rgba(58,52,40,0.06)",overflow:"hidden"}}>
      {/* Toolbar */}
      <div style={{padding:"16px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["all",...MEAL_TYPES].map(f=><button key={f} onClick={()=>setFilter(f)} style={pill(filter===f)}>{f}</button>)}
          {allTags.length>0 && <span style={{...font(11,400,C.light),alignSelf:"center",margin:"0 4px"}}>|</span>}
          {allTags.slice(0,6).map(t=><button key={t} onClick={()=>setTagFilter(tagFilter===t?null:t)} style={{...pill(tagFilter===t,C.fat),fontSize:11,padding:"4px 10px"}}>{t}</button>)}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{position:"relative"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{...inputStyle,width:180,paddingLeft:32}} />
            <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}} width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke={C.light} strokeWidth="1.5"/><line x1="11" y1="11" x2="14" y2="14" stroke={C.light} strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <button onClick={onAdd} style={{...btnPrimary,padding:"8px 16px",display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:16,lineHeight:1}}>+</span> Add Recipe
          </button>
        </div>
      </div>
      <div style={{...font(11,400,C.light),padding:"10px 24px",letterSpacing:"0.06em",textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,background:C.cardAlt}}>
        {filtered.length} recipe{filtered.length!==1?"s":""}
      </div>
      {/* Recipe List */}
      {filtered.map(recipe => {
        const expanded = expandedId===recipe.id;
        const nutrition = calcRecipeNutrition(recipe.ingredients,recipe.servings);
        return (
          <div key={recipe.id} style={{borderBottom:`1px solid ${C.border}`,background:expanded?C.cardAlt:"transparent",transition:"background 0.3s"}}>
            <div onClick={()=>setExpandedId(expanded?null:recipe.id)} style={{display:"flex",alignItems:"center",padding:"14px 24px",cursor:"pointer",gap:14,userSelect:"none"}}>
              <div style={{flex:1}}>
                <div style={heading(15,500)}>{recipe.name}</div>
                <div style={{...font(12,400,C.light),marginTop:2,textTransform:"capitalize"}}>{recipe.type} · {nutrition.perServing.cal} kcal · {recipe.servings} serving{recipe.servings>1?"s":""}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {recipe.tags.slice(0,2).map(t=><TagChip key={t} label={t} small/>)}
                <span style={{...font(12,500,C.muted),background:C.chipBg,padding:"3px 9px",borderRadius:16}}>{nutrition.perServing.p}g protein</span>
                <svg width="18" height="18" viewBox="0 0 20 20" style={{transition:"transform 0.3s",transform:expanded?"rotate(180deg)":"rotate(0)"}}>
                  <polyline points="5,8 10,13 15,8" fill="none" stroke={C.light} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            {expanded && (
              <div style={{padding:"0 24px 20px 24px"}}>
                <div style={{display:"flex",gap:24,marginBottom:16}}>
                  <MacroBar label="Protein" value={nutrition.perServing.p} max={50} color={C.protein}/>
                  <MacroBar label="Carbs" value={nutrition.perServing.c} max={70} color={C.carbs}/>
                  <MacroBar label="Fat" value={nutrition.perServing.f} max={40} color={C.fat}/>
                  <MacroBar label="Fiber" value={nutrition.perServing.fb} max={15} color={C.fiber}/>
                </div>
                <div style={{display:"flex",gap:32}}>
                  <div style={{flex:1}}>
                    {Object.keys(nutrition.vitamins).length>0 && (<>
                      <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Vitamins & Minerals</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 20px",marginBottom:16}}>
                        {Object.entries(nutrition.vitamins).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",...font(12)}}><span style={{color:C.muted}}>{k}</span><span style={{fontWeight:600,color:C.med}}>{v}</span></div>)}
                      </div>
                    </>)}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Ingredients</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {recipe.ingredients.map(ing=><span key={ing.id} style={{...font(12),background:C.chipBg,color:C.med,padding:"3px 10px",borderRadius:16}}>{ing.amount}{ing.unit||"g"} {ing.name}</span>)}
                    </div>
                  </div>
                </div>
                {recipe.notes && <div style={{...font(13,400,C.med),marginTop:12,lineHeight:1.6,background:C.card,padding:12,borderRadius:8,border:`1px solid ${C.chipBg}`}}>💬 {recipe.notes}</div>}
                {recipe.link && <a href={recipe.link} target="_blank" rel="noopener noreferrer" style={{...font(12,500,C.protein),textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4,marginTop:8}}>View full recipe ↗</a>}
                <div style={{display:"flex",gap:8,marginTop:16}}>
                  <button onClick={e=>{e.stopPropagation();onEdit(recipe);}} style={{...btnSecondary,padding:"6px 14px",...font(12,500,C.muted)}}>Edit</button>
                  {confirmDelete===recipe.id ? (
                    <><button onClick={e=>{e.stopPropagation();onDelete(recipe.id);setConfirmDelete(null);}} style={{...btnSecondary,padding:"6px 14px",borderColor:C.danger,...font(12,600,C.danger)}}>Confirm Delete</button>
                    <button onClick={e=>{e.stopPropagation();setConfirmDelete(null);}} style={{...btnSecondary,padding:"6px 14px",...font(12,500,C.light)}}>Cancel</button></>
                  ) : (
                    <button onClick={e=>{e.stopPropagation();setConfirmDelete(recipe.id);}} style={{...btnSecondary,padding:"6px 14px",...font(12,500,C.danger)}}>Delete</button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {filtered.length===0 && <EmptyState emoji="🍽️" title="No recipes found" sub="Try adjusting your filters or add a new recipe"/>}
    </div>
  );
};

// ─── WEEKLY PLANNER VIEW ──────────────────────────────────────────────────
const WeeklyPlanner = ({recipes,weekPlans,setWeekPlans}) => {
  const [weekOffset,setWeekOffset] = useState(0);
  const [editMode,setEditMode] = useState(false);
  const [addingMeal,setAddingMeal] = useState(null); // {day,slot}
  const [viewingMeal,setViewingMeal] = useState(null);
  const [dragOver,setDragOver] = useState(null);
  const [editSearch,setEditSearch] = useState("");
  const [editFilter,setEditFilter] = useState("all");
  const [editTagFilter,setEditTagFilter] = useState(null);

  const weekKey = getWeekKey(weekOffset);
  const weekDates = getWeekDates(weekOffset);
  const plan = weekPlans[weekKey] || {};

  const getMeals = (day,slot) => (plan[day]&&plan[day][slot]) || [];
  const setPlan = (newPlan) => setWeekPlans(p=>({...p,[weekKey]:newPlan}));

  const addRecipeToPlan = (day,slot,recipeId) => {
    const cur = {...plan};
    if(!cur[day]) cur[day]={breakfast:[],lunch:[],dinner:[]};
    if(!cur[day][slot]) cur[day][slot]=[];
    cur[day][slot]=[...cur[day][slot],{recipeId,customTitle:"",customDescription:"",customLink:""}];
    setPlan(cur); setAddingMeal(null);
  };
  const addCustomToPlan = (day,slot,custom) => {
    const cur = {...plan};
    if(!cur[day]) cur[day]={breakfast:[],lunch:[],dinner:[]};
    if(!cur[day][slot]) cur[day][slot]=[];
    cur[day][slot]=[...cur[day][slot],{recipeId:null,customTitle:custom.title,customDescription:custom.description,customLink:custom.link}];
    setPlan(cur); setAddingMeal(null);
  };
  const removeMealFromPlan = (day,slot,idx) => {
    const cur = {...plan};
    cur[day][slot] = cur[day][slot].filter((_,i)=>i!==idx);
    setPlan(cur);
  };

  const handleDrop = (day,slot,e) => {
    e.preventDefault(); setDragOver(null);
    const recipeId = e.dataTransfer.getData("recipeId");
    if(recipeId) addRecipeToPlan(day,slot,recipeId);
  };

  const allTags = [...new Set(recipes.flatMap(r=>r.tags))].sort();
  const editFiltered = recipes.filter(r=>{
    if(editFilter!=="all"&&r.type!==editFilter)return false;
    if(editTagFilter&&!r.tags.includes(editTagFilter))return false;
    if(editSearch&&!r.name.toLowerCase().includes(editSearch.toLowerCase()))return false;
    return true;
  });

  const weekStart=weekDates[0], weekEnd=weekDates[6];
  const borderColors = {breakfast:C.carbs,lunch:C.fat,dinner:C.protein};
  const slots = ["breakfast","lunch","dinner"];

  // Calculate weekly totals
  let weekCals=0, weekP=0, weekC2=0, weekF=0;
  for(let d=0;d<7;d++){slots.forEach(s=>{getMeals(d,s).forEach(m=>{if(m.recipeId){const r=recipes.find(x=>x.id===m.recipeId);if(r){const n=calcRecipeNutrition(r.ingredients,r.servings);weekCals+=n.perServing.cal;weekP+=n.perServing.p;weekC2+=n.perServing.c;weekF+=n.perServing.f;}}});});}

  // ── EDIT MODE ──
  if(editMode) return (
    <div style={{background:C.card,borderRadius:"0 8px 8px 8px",boxShadow:"0 2px 20px rgba(58,52,40,0.06)",overflow:"hidden"}}>
      <div style={{padding:"16px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={heading(18,500)}>Edit Week: {MONTH_NAMES[weekStart.getMonth()]} {weekStart.getDate()} – {MONTH_NAMES[weekEnd.getMonth()]} {weekEnd.getDate()}</div>
        <button onClick={()=>setEditMode(false)} style={{...btnPrimary,padding:"8px 18px"}}>Done Editing</button>
      </div>
      <div style={{display:"flex",minHeight:500}}>
        {/* Left Panel: Recipe List */}
        <div style={{width:280,borderRight:`1px solid ${C.border}`,padding:16,overflowY:"auto",maxHeight:"70vh",background:C.cardAlt}}>
          <input value={editSearch} onChange={e=>setEditSearch(e.target.value)} placeholder="Search recipes…" style={{...inputStyle,marginBottom:10,fontSize:12}} />
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
            {["all",...MEAL_TYPES].map(f=><button key={f} onClick={()=>setEditFilter(f)} style={{...pill(editFilter===f),fontSize:10,padding:"3px 8px"}}>{f}</button>)}
          </div>
          {allTags.length>0 && <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
            {allTags.slice(0,8).map(t=><button key={t} onClick={()=>setEditTagFilter(editTagFilter===t?null:t)} style={{...pill(editTagFilter===t,C.fat),fontSize:10,padding:"2px 7px"}}>{t}</button>)}
          </div>}
          <div style={{...font(10,500,C.light),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{editFiltered.length} recipes — drag to assign</div>
          {editFiltered.map(r=>{const n=calcRecipeNutrition(r.ingredients,r.servings); return (
            <div key={r.id} draggable onDragStart={e=>e.dataTransfer.setData("recipeId",r.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 10px",cursor:"grab",borderRadius:8,marginBottom:4,background:C.card,border:`1px solid ${C.chipBg}`,...font(12)}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.light} onMouseLeave={e=>e.currentTarget.style.borderColor=C.chipBg}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{...font(12,500),lineHeight:1.3}}>{r.name}</div>
                <div style={font(10,400,C.light)}>{n.perServing.cal} kcal · {n.perServing.p}g P</div>
              </div>
              <span style={{...font(10,400,C.light),textTransform:"capitalize"}}>{r.type}</span>
            </div>
          );})}
        </div>
        {/* Right Panel: Week Grid */}
        <div style={{flex:1,padding:16,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"60px repeat(7,1fr)",gap:6,minWidth:0}}>
            <div/>
            {weekDates.map((d,i)=>{const isToday=d.toDateString()===new Date().toDateString(); return (
              <div key={i} style={{textAlign:"center",paddingBottom:6}}>
                <div style={{...font(10,400,C.light),textTransform:"uppercase"}}>{DAY_NAMES[i]}</div>
                <div style={{...heading(16,600,isToday?"#fff":C.dark),background:isToday?C.dark:"transparent",width:28,height:28,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",marginTop:2}}>{d.getDate()}</div>
              </div>
            );})}
            {slots.map(slot=>(<React.Fragment key={slot}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{...font(9,600,C.light),textTransform:"uppercase",letterSpacing:"0.1em",writingMode:"vertical-lr",transform:"rotate(180deg)"}}>{slot}</span>
              </div>
              {Array.from({length:7},(_,day)=>{
                const meals = getMeals(day,slot);
                const isOver = dragOver===`${day}-${slot}`;
                return (
                  <div key={day} onDragOver={e=>{e.preventDefault();setDragOver(`${day}-${slot}`);}} onDragLeave={()=>setDragOver(null)} onDrop={e=>handleDrop(day,slot,e)}
                    style={{minHeight:70,background:isOver?"rgba(138,171,127,0.15)":C.cardAlt,borderRadius:8,padding:6,borderLeft:`3px solid ${borderColors[slot]}`,border:isOver?`2px dashed ${C.fat}`:`1px solid ${C.chipBg}`,borderLeftWidth:3,transition:"all 0.15s"}}>
                    {meals.map((m,mi)=>{const r=m.recipeId?recipes.find(x=>x.id===m.recipeId):null; return (
                      <div key={mi} style={{display:"flex",alignItems:"flex-start",gap:4,padding:"3px 4px",background:C.card,borderRadius:5,marginBottom:3,...font(10,500)}}>
                        <span style={{flex:1,lineHeight:1.3,wordBreak:"break-word"}}>{r?r.name:m.customTitle}</span>
                        <span onClick={()=>removeMealFromPlan(day,slot,mi)} style={{cursor:"pointer",...font(14,300,C.light),lineHeight:1,flexShrink:0}}>×</span>
                      </div>
                    );})}
                    <div onClick={()=>setAddingMeal({day,slot})} style={{...font(10,400,C.light),textAlign:"center",padding:"4px 0",cursor:"pointer",borderRadius:4,marginTop:2}} onMouseEnter={e=>e.currentTarget.style.background=C.chipBg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>+ add</div>
                  </div>
                );
              })}
            </React.Fragment>))}
          </div>
        </div>
      </div>
      {addingMeal && <AddMealModal recipes={recipes} onAddRecipe={id=>addRecipeToPlan(addingMeal.day,addingMeal.slot,id)} onAddCustom={c=>addCustomToPlan(addingMeal.day,addingMeal.slot,c)} onClose={()=>setAddingMeal(null)} />}
    </div>
  );

  // ── NORMAL VIEW ──
  return (
    <div style={{background:C.card,borderRadius:"0 8px 8px 8px",boxShadow:"0 2px 20px rgba(58,52,40,0.06)",overflow:"hidden"}}>
      {/* Week Nav */}
      <div style={{padding:"16px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button onClick={()=>setWeekOffset(o=>o-1)} style={{background:"none",border:`1.5px solid ${C.borderLight}`,borderRadius:"50%",width:34,height:34,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="12" height="12" viewBox="0 0 14 14"><polyline points="9,3 5,7 9,11" fill="none" stroke={C.med} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={{textAlign:"center"}}>
          <div style={heading(18,500)}>{MONTH_NAMES[weekStart.getMonth()]} {weekStart.getDate()} – {MONTH_NAMES[weekEnd.getMonth()]} {weekEnd.getDate()}, {weekEnd.getFullYear()}</div>
          <div style={{...font(12,400,C.light),marginTop:2}}>
            {weekOffset===0?"This Week":weekOffset===-1?"Last Week":weekOffset===1?"Next Week":`${Math.abs(weekOffset)} weeks ${weekOffset<0?"ago":"ahead"}`}
            {weekCals>0&&` · ${Math.round(weekCals/7)} avg kcal/day`}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {weekOffset!==0&&<button onClick={()=>setWeekOffset(0)} style={{...btnSecondary,padding:"6px 12px",...font(11,500,C.muted)}}>Today</button>}
          <button onClick={()=>setEditMode(true)} style={{...btnPrimary,padding:"6px 14px",...font(11,600,"#fff")}}>Edit Week</button>
          <button onClick={()=>setWeekOffset(o=>o+1)} style={{background:"none",border:`1.5px solid ${C.borderLight}`,borderRadius:"50%",width:34,height:34,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="12" height="12" viewBox="0 0 14 14"><polyline points="5,3 9,7 5,11" fill="none" stroke={C.med} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
      {/* Week Grid */}
      <div style={{padding:"12px 16px 20px"}}>
        <div style={{display:"grid",gridTemplateColumns:"70px repeat(7,1fr)",gap:8}}>
          <div/>
          {weekDates.map((d,i)=>{const isToday=d.toDateString()===new Date().toDateString(); return (
            <div key={i} style={{textAlign:"center",paddingBottom:4}}>
              <div style={{...font(11,400,C.light),textTransform:"uppercase",letterSpacing:"0.06em"}}>{DAY_NAMES[i]}</div>
              <div style={{...heading(20,600,isToday?"#fff":C.dark),background:isToday?C.dark:"transparent",width:34,height:34,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",marginTop:2}}>{d.getDate()}</div>
            </div>
          );})}
          {slots.map(slot=>(<React.Fragment key={slot}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{...font(10,600,C.light),textTransform:"uppercase",letterSpacing:"0.1em",writingMode:"vertical-lr",transform:"rotate(180deg)"}}>{slot}</span>
            </div>
            {Array.from({length:7},(_,day)=>{
              const meals = getMeals(day,slot);
              return (
                <div key={day} style={{background:C.cardAlt,borderRadius:8,padding:8,borderLeft:`3px solid ${borderColors[slot]}`,minHeight:80,display:"flex",flexDirection:"column",gap:4}}>
                  {meals.map((m,mi)=>{
                    const r = m.recipeId ? recipes.find(x=>x.id===m.recipeId) : null;
                    const n = r ? calcRecipeNutrition(r.ingredients,r.servings) : null;
                    return (
                      <div key={mi} onClick={()=>setViewingMeal(m)} style={{cursor:"pointer",padding:6,borderRadius:6,background:C.card,transition:"all 0.2s"}}
                        onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 2px 8px rgba(58,52,40,0.08)";}}
                        onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                        <div style={{...font(11,500),lineHeight:1.3,wordBreak:"break-word"}}>{r?r.name:m.customTitle}</div>
                        {n&&<div style={{...font(10,400,C.light),marginTop:2}}>{n.perServing.cal} kcal</div>}
                      </div>
                    );
                  })}
                  {meals.length===0 && <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",...font(11,400,C.light),opacity:0.5}}>—</div>}
                </div>
              );
            })}
          </React.Fragment>))}
        </div>
      </div>
      {/* Weekly Totals */}
      {weekCals>0 && (
        <div style={{padding:"16px 24px",borderTop:`1px solid ${C.border}`,background:C.cardAlt,display:"flex",gap:24}}>
          <div style={{...font(11,600,C.light),textTransform:"uppercase",letterSpacing:"0.08em",alignSelf:"center",marginRight:8}}>Weekly Totals</div>
          {[["Calories",weekCals.toLocaleString(),"kcal",C.dark],["Protein",weekP,"g",C.protein],["Carbs",weekC2,"g",C.carbs],["Fat",weekF,"g",C.fat]].map(([l,v,u,c])=>(
            <div key={l}><div style={{...heading(20,600,c)}}>{v}</div><div style={{...font(10,400,C.light)}}>{u} {l.toLowerCase()}</div></div>
          ))}
        </div>
      )}
      {viewingMeal && <MealDetailModal entry={viewingMeal} recipes={recipes} onClose={()=>setViewingMeal(null)} />}
      {addingMeal && <AddMealModal recipes={recipes} onAddRecipe={id=>addRecipeToPlan(addingMeal.day,addingMeal.slot,id)} onAddCustom={c=>addCustomToPlan(addingMeal.day,addingMeal.slot,c)} onClose={()=>setAddingMeal(null)} />}
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────
export default function NourishApp() {
  const [view,setView] = useState("meals");
  const [recipes,setRecipes] = useState([]);
  const [weekPlans,setWeekPlans] = useState({});
  const [loaded,setLoaded] = useState(false);
  const [recipeModal,setRecipeModal] = useState(null); // null | "new" | recipe

  // Load from persistent storage
  useEffect(()=>{
    (async()=>{
      try {
        const rRes = await window.storage.get("nourish-recipes");
        const wRes = await window.storage.get("nourish-weekplans");
        setRecipes(rRes?JSON.parse(rRes.value):makeDefaultRecipes());
        setWeekPlans(wRes?JSON.parse(wRes.value):{});
      } catch {
        setRecipes(makeDefaultRecipes());
        setWeekPlans({});
      }
      setLoaded(true);
    })();
  },[]);

  // Save to persistent storage on changes
  useEffect(()=>{
    if(!loaded) return;
    (async()=>{try{await window.storage.set("nourish-recipes",JSON.stringify(recipes));}catch{}})();
  },[recipes,loaded]);
  useEffect(()=>{
    if(!loaded) return;
    (async()=>{try{await window.storage.set("nourish-weekplans",JSON.stringify(weekPlans));}catch{}})();
  },[weekPlans,loaded]);

  const handleSaveRecipe = (r) => {
    setRecipes(prev=>prev.some(x=>x.id===r.id)?prev.map(x=>x.id===r.id?r:x):[...prev,r]);
    setRecipeModal(null);
  };
  const handleDeleteRecipe = (id) => setRecipes(prev=>prev.filter(x=>x.id!==id));

  if(!loaded) return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",...font(14,400,C.light)}}>Loading…</div>;

  return (
    <div style={{minHeight:"100vh",background:C.bg,...font(14)}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#3a3428 0%,#5c5549 100%)",padding:"28px 40px 0"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
            <div style={{display:"flex",alignItems:"baseline",gap:12}}>
              <span style={{...heading(28,600,C.bg)}}>nourish</span>
              <span style={{...font(11,400,C.light),letterSpacing:"0.15em",textTransform:"uppercase"}}>meal tracker</span>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:C.fat}}/>
              <span style={{...font(12,400,C.light)}}>{recipes.length} recipes</span>
            </div>
          </div>
          <div style={{display:"flex",gap:0}}>
            {[["meals","Meal Library"],["planner","Weekly Planner"]].map(([key,label])=>(
              <button key={key} onClick={()=>setView(key)} style={{...font(13,500,view===key?C.dark:C.light),letterSpacing:"0.04em",padding:"12px 28px",border:"none",cursor:"pointer",borderRadius:"8px 8px 0 0",background:view===key?C.bg:"transparent",transition:"all 0.3s",position:"relative",bottom:-1}}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      {/* Content */}
      <div style={{maxWidth:1200,margin:"0 auto",padding:"0 40px 60px"}}>
        {view==="meals" && <MealLibrary recipes={recipes} onAdd={()=>setRecipeModal("new")} onEdit={r=>setRecipeModal(r)} onDelete={handleDeleteRecipe}/>}
        {view==="planner" && <WeeklyPlanner recipes={recipes} weekPlans={weekPlans} setWeekPlans={setWeekPlans}/>}
      </div>
      {/* Recipe Modal */}
      {recipeModal && <RecipeModal recipe={recipeModal==="new"?null:recipeModal} onSave={handleSaveRecipe} onClose={()=>setRecipeModal(null)} />}
    </div>
  );
}
