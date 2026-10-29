'use strict';
// Baseline gameplay/render code from Witch_Isometric_Character_Demo.html (data lines moved to assets/js/*-data.js).
// Classic script: shares global lexical scope with atlas-data.js and cast-data.js.
/*
  SPRITE ATLAS — complete, flattened frames; no runtime skeletal animation.
  Each frame is 48×56 pixels; columns are frames 0–7. Each set occupies eight
  rows in this exact direction order: N, NE, E, SE, S, SW, W, NW.
  Row groups:
     0–7   STANDING / idle     8 frames × 125 ms (8 fps)
     8–15  WALKING / walk     8 frames, 2 screen pixels per frame
   16–23  HOVERING / hover   8 frames × 100 ms (10 fps)
   24–31  FLYING / fly       8 frames × 100 ms (10 fps)
   32–39  MOUNT / mount      8 frames × 100 ms; landing reverses the sequence
   40–47  FLYING / bank left 8 frames × 100 ms
   48–55  FLYING / bank right 8 frames × 100 ms
   56–63  CAST / wand cast    8 frames × 60 ms
  Each bitmap is part of the embedded PNG; names, coordinates, frame timing,
  and the direction lookup are all listed here and in ANIMATIONS below.
*/
const DIRS = ['N','NE','E','SE','S','SW','W','NW'];
const ANIMATIONS = Object.freeze({
  idle:       {row:0,  frames:8, frameMs:125},
  walk:       {row:8,  frames:8, distancePerFrame:2},
  hover:      {row:16, frames:8, frameMs:100},
  fly:        {row:24, frames:8, frameMs:100},
  mount:      {row:32, frames:8, frameMs:100},
  bank_left:  {row:40, frames:8, frameMs:100},
  bank_right: {row:48, frames:8, frameMs:100},
  cast:       {row:56, frames:8, frameMs:60}
});
const FRAME_W=48, FRAME_H=56, FOOT_X=24, FOOT_Y=49;
// Each atlas has the same 8 directions and 8 frames. Color ramps are changed
// on a cached copy of the atlas, so every pose and transition shares the look.
const COLOR_KEYS={
  skin:['e7b89c','bc897e','f3cbb2'],hair:['272833','474650','3c3b46'],
  outfit:['3b3944','55535f','4a4853','393944','55545f','292b35','5b5864','6e6871']
};
const PALETTES={
  skin:{
    porcelain:['f3d0b9','c99b89','ffe4d3'], warm:['e7b89c','bc897e','f3cbb2'],
    honey:['c98f6c','99664f','e5ae8a'],tan:['aa7052','7c4b39','c98d69'],
    deep:['85523b','603629','a87355'],rich:['58392d','3c261f','805440']
  },
  hair:{
    ink:['272833','474650','3c3b46'],brown:['5b4032','8a6650','75543f'],auburn:['a2573d','c6815b','b66b4d'],
    gold:['c2a271','e0c696','d2b481'],silver:['a8abb0','d5d6d4','bec0c1']
  },
  outfit:{
    charcoal:['3b3944','55535f','4a4853','393944','55545f','292b35','5b5864','6e6871'],
    plum:['5d4964','89748b','715d78','66506d','8a778d','413247','756679','908093'],
    moss:['496852','77917a','5f7b63','4d7058','78957d','334b39','657963','81917a'],
    ocean:['426474','77919a','5b7985','426a79','7798a0','304a57','607b83','7f9798'],
    rose:['825455','b3827f','9a6b6a','925f60','bd9190','603f43','967375','af8d89'],
    ochre:['866b48','b59b70','9c8057','96784f','c0a67b','604c38','9e8b6d','b8a687']
  }
};
const defaultLook={style:'feminine',skin:'warm',hair:'ink',outfit:'charcoal'};
let chosenLook={...defaultLook};
try{
  const saved=JSON.parse(localStorage.getItem('moss-moon-look')||'null');
  if(saved&&typeof saved==='object'){
    if(Object.hasOwn(ATLAS_DATA,saved.style))chosenLook.style=saved.style;
    for(const group of ['skin','hair','outfit'])if(Object.hasOwn(PALETTES[group],saved[group]))chosenLook[group]=saved[group];
  }
}catch(_error){} // Files opened in a private browser can disable localStorage.
// ---- MM seam S0: helpers. Every "MM seam" below is a no-op when window.MM is absent (see notes/BASELINE_AUDIT.md §10).
const UI_STUBS={};
function uiEl(id,tag='div'){return document.getElementById(id)||UI_STUBS[id]||(UI_STUBS[id]=document.createElement(tag));}
let mmQuiet=0; // >0 while restoring/starting an adventure: suppresses 'message' events (no toast spam)
function mmEmit(name,data){if(name==='message'&&mmQuiet>0)return;try{window.MM?.bus?.emit?.(name,data);}catch(e){console.error('[MM emit]',name,e);}}
function mmHook(name,...a){const f=window.MM?.hooks?.[name];if(typeof f==='function'){try{return f(...a);}catch(e){console.error('[MM hook]',name,e);}}}
function mmPaused(){try{return !!window.MM?.isPaused?.();}catch(e){return false;}}
function mmInputBlocked(){try{const i=window.MM?.input;return i?.isBlocked?!!i.isBlocked():mmPaused();}catch(e){return false;}}
function mmSetting(key,fallback){try{const v=window.MM?.settings?.get?.(key);return v===undefined?fallback:v;}catch(e){return fallback;}}
function mmArt(name,x,y,o){const a=window.MM?.art;if(!a?.has?.(name))return false;try{return a.draw(ctx,name,x,y,o)!==false;}catch(e){return false;}}
// ---- end MM seam S0
const canvas=document.getElementById('scene');
const ctx=canvas.getContext('2d',{alpha:false}); ctx.imageSmoothingEnabled=false;
const atlasImages={};
const colorBuffer=document.createElement('canvas');
let recoloredAtlas=null;
function buildColoredAtlas(){
  const source=atlasImages[chosenLook.style];
  if(!source||!source.complete||!source.naturalWidth){recoloredAtlas=null;return;}
  const buffer=colorBuffer;buffer.width=source.naturalWidth;buffer.height=source.naturalHeight;
  const bc=buffer.getContext('2d',{willReadFrequently:true});bc.imageSmoothingEnabled=false;
  bc.drawImage(source,0,0);
  const data=bc.getImageData(0,0,buffer.width,buffer.height),pixels=data.data,map=new Map();
  for(const group of ['skin','hair','outfit']){
    const to=PALETTES[group][chosenLook[group]];
    COLOR_KEYS[group].forEach((from,i)=>map.set(parseInt(from,16),parseInt(to[i],16)));
  }
  for(let i=0;i<pixels.length;i+=4){
    if(!pixels[i+3])continue;
    const key=(pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2],replacement=map.get(key);
    if(replacement!==undefined){pixels[i]=replacement>>16;pixels[i+1]=(replacement>>8)&255;pixels[i+2]=replacement&255;}
  }
  bc.putImageData(data,0,0);recoloredAtlas=buffer;
}
for(const style of Object.keys(ATLAS_DATA)){
  const image=new Image();atlasImages[style]=image;
  image.onload=()=>{if(chosenLook.style===style)buildColoredAtlas();};
  image.src=ATLAS_DATA[style];
}
// MM seam S1: null-safe DOM lookups (detached stubs when the legacy sidebar is absent).
const debug=uiEl('debug');
const modeLabel=uiEl('modeLabel');
const modeDetail=uiEl('modeDetail');
const mountBtn=uiEl('mount','button');
const touchMount=uiEl('touchMount','button');
const toggleDebug=uiEl('debugToggle','button');
const keys=new Set();
const touchDirections=new Map();
const SCREEN_W=512,SCREEN_H=320,TILE_W=32,TILE_H=16,MAP_SIZE=20;
const WALK_SPEED=22, FLY_SPEED=60, RIDE_HEIGHT=13;
const BOB=[0,0,-1,-2,-2,-1,0,0];
const vec={N:[0,-1],NE:[1,-1],E:[1,0],SE:[1,1],S:[0,1],SW:[-1,1],W:[-1,0],NW:[-1,-1]};
// Each spell has its own color, timing, effect, damage, and optional status.
// The same definitions drive the selector, drawing, and actual dummy hits.
const SPELLS=[
 {id:'ember',name:'Ember Bolt',school:'Fire',kind:'bolt',color:'#f47c46',core:'#ffe3a1',damage:34,hit:[.38],duration:.92,status:'burn',description:'A quick flame that leaves burning embers.'},
 {id:'frost',name:'Frost Shard',school:'Frost',kind:'shard',color:'#8cd9ee',core:'#e9ffff',damage:36,hit:[.43],duration:.90,status:'chill',description:'An icy shard chills the target.'},
 {id:'spark',name:'Arc Spark',school:'Storm',kind:'lightning',color:'#f4de74',core:'#fff7d3',damage:32,hit:[.17],duration:.60,status:'shock',description:'A crackling bolt jumps to the dummy.'},
 {id:'missile',name:'Arcane Missile',school:'Arcane',kind:'missile',color:'#b39aef',core:'#eee0ff',damage:39,hit:[.35],duration:.85,description:'A focused dart of arcane energy.'},
 {id:'poison',name:'Venom Seed',school:'Nature',kind:'seed',color:'#9bcc68',core:'#e1f3aa',damage:26,hit:[.40],duration:1.0,status:'poison',description:'A seed poisons the target over time.'},
 {id:'star',name:'Starlight Dart',school:'Astral',kind:'star',color:'#f5d58c',core:'#fff9db',damage:38,hit:[.42],duration:.90,description:'A bright star flies from the wand.'},
 {id:'moonbeam',name:'Moonbeam',school:'Moon',kind:'beam',color:'#a8c7f4',core:'#f1f5ff',damage:48,hit:[.18],duration:.75,description:'A cool, concentrated beam of moonlight.'},
 {id:'sunlance',name:'Sun Lance',school:'Sun',kind:'beam',color:'#ffba55',core:'#fff5b9',damage:45,hit:[.19],duration:.76,status:'burn',description:'A golden lance scorches the dummy.'},
 {id:'fireball',name:'Fireball',school:'Fire',kind:'fireball',color:'#f67540',core:'#ffe29a',damage:60,hit:[.55],duration:1.2,status:'burn',description:'A fireball bursts on impact and burns.'},
 {id:'blizzard',name:'Blizzard',school:'Frost',kind:'blizzard',color:'#b7e6f6',core:'#f6ffff',damage:60,hit:[.38,.72,1.06],duration:1.45,status:'chill',description:'Three waves of snow strike and chill.'},
 {id:'thunder',name:'Thunderstorm',school:'Storm',kind:'storm',color:'#a8a1db',core:'#fff397',damage:72,hit:[.37,.70,1.02],duration:1.45,status:'shock',description:'Three lightning strikes hit the target.'},
 {id:'vines',name:'Vine Grasp',school:'Nature',kind:'vines',color:'#71ad68',core:'#c7e990',damage:31,hit:[.40],duration:1.35,status:'root',description:'Vines wrap and root the target.'},
 {id:'meteor',name:'Meteor Fall',school:'Fire',kind:'meteor',color:'#eb6e43',core:'#ffd686',damage:82,hit:[.68],duration:1.35,status:'burn',description:'A heavy meteor crashes from above.'},
 {id:'earth',name:'Earth Spikes',school:'Earth',kind:'spikes',color:'#ac876a',core:'#e5c99d',damage:56,hit:[.40],duration:1.10,description:'Stone spikes rise beneath the dummy.'},
 {id:'tide',name:'Tidal Wave',school:'Water',kind:'wave',color:'#6eb8cf',core:'#d8f7f5',damage:49,hit:[.55],duration:1.15,description:'A rolling surge washes over the target.'},
 {id:'wind',name:'Wind Slash',school:'Wind',kind:'wind',color:'#b5d8c0',core:'#f2fff1',damage:42,hit:[.35],duration:.9,description:'A sharp, swirling gust cuts across the grove.'},
 {id:'shadow',name:'Shadow Orb',school:'Shadow',kind:'orb',color:'#795899',core:'#d5b7ee',damage:58,hit:[.62],duration:1.2,description:'A slow orb blossoms into shadow.'},
 {id:'gravity',name:'Gravity Well',school:'Arcane',kind:'well',color:'#8d72c6',core:'#e2cff7',damage:30,hit:[.45],duration:1.4,status:'vulnerable',description:'Marks the dummy: following hits deal 25% more.'},
 {id:'fairy',name:'Fairy Swarm',school:'Spirit',kind:'swarm',color:'#e9a9d2',core:'#fff4dd',damage:60,hit:[.38,.63,.88],duration:1.25,description:'Three tiny wisps strike in succession.'},
 {id:'nova',name:'Radiant Nova',school:'Sun',kind:'nova',color:'#f1c66f',core:'#fff7ca',damage:65,hit:[.38],duration:1.05,description:'A ring of radiant magic blooms around the dummy.'}
];
SPELLS.push(
 {id:'bone',name:'Bone Spear',school:'Necromancy',kind:'shard',color:'#d7d0b3',core:'#fff5d7',damage:46,hit:[.38],duration:.95,description:'A sharpened bone pierces the target.'},
 {id:'skeleton',name:'Raise Skeleton',school:'Necromancy',kind:'summon',color:'#d3c8a9',core:'#fff2d1',damage:0,hit:[.20],duration:1.0,summon:'skeleton',description:'Raise a skeleton ally that attacks nearby enemies.'},
 {id:'siphon',name:'Soul Siphon',school:'Necromancy',kind:'beam',color:'#9ac7a9',core:'#e2ffe4',damage:34,hit:[.22],duration:.8,heal:12,description:'Drain the target and restore health.'},
 {id:'wisp',name:'Summon Wisp',school:'Summoning',kind:'summon',color:'#cdaef6',core:'#fff1ff',damage:0,hit:[.20],duration:1.0,summon:'wisp',description:'Call a glowing wisp to fight for you.'},
 {id:'golem',name:'Summon Golem',school:'Summoning',kind:'summon',color:'#b89573',core:'#ffe1a7',damage:0,hit:[.20],duration:1.0,summon:'golem',description:'Call a sturdy golem to protect you.'},
 {id:'hex',name:'Spirit Hex',school:'Voodoo',kind:'well',color:'#bd83cf',core:'#ffd5ff',damage:36,hit:[.35],duration:1.15,status:'vulnerable',description:'A spirit charm marks the target as vulnerable.'},
 {id:'ward',name:'Ancestor’s Blessing',school:'Voodoo',kind:'summon',color:'#edc388',core:'#fff8d5',damage:0,hit:[.20],duration:1.0,blessing:true,description:'Call a protective blessing that restores health.'},
 {id:'rewind',name:'Moment Rewind',school:'Arcane',kind:'summon',color:'#a9daf0',core:'#f0ffff',damage:0,hit:[.20],duration:1.0,rewind:true,description:'Reverse the last hit and restore health.'},
 {id:'cloak',name:'Shadow Veil',school:'Shadow',kind:'summon',color:'#8066a5',core:'#e2d3f6',damage:0,hit:[.20],duration:1.0,cloak:true,description:'Hide from enemies for a short time.'},
 {id:'mirage',name:'Moon Mirage',school:'Moon',kind:'summon',color:'#aac6f3',core:'#f7f7ff',damage:0,hit:[.20],duration:1.0,summon:'mirage',description:'Create a decoy that distracts enemies.'}
);
// MM seam S1: null-safe DOM lookups.
const spellSelect=uiEl('spellSelect','select');
const castButton=uiEl('castButton','button');
const resetDummyButton=uiEl('resetDummy','button');
const spellDesc=uiEl('spellDesc');
const dummyStatus=uiEl('dummyStatus');
spellSelect.innerHTML=SPELLS.map((s,i)=>`<option value="${i}">${s.school} · ${s.name}</option>`).join('');
let spellIndex=0;
const dummy={x:12,y:9,maxHP:1200,hp:1200,status:{},flash:0,resetIn:0};
const effects=[];
const numbers=[];
let castCooldown=0,combatMessage='',combatMessageTime=0;
let game;
function freshGame(){return {x:9.7,y:10.0,vx:0,vy:0,camX:0,camY:0,heading:Math.PI/2,
  facing:'S',mounted:false,transition:null,height:0,elapsed:0,walkDistance:0,
  frame:0,animation:'idle',state:'Standing',target:null,bank:0,bankTimer:0,castRemaining:0,castFacing:'S'};}
game=freshGame(); let q=project(game.x,game.y); game.camX=q.x;game.camY=q.y;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ease=(t)=>t*t*(3-2*t);
function project(x,y){return {x:(x-y)*TILE_W/2,y:(x+y)*TILE_H/2};}
function unproject(x,y){return {x:x/TILE_W+y/TILE_H,y:-x/TILE_W+y/TILE_H};}
function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function facingFromAngle(a){return DIRS[((Math.round((a+Math.PI/2)/(Math.PI/4))%8)+8)%8];}
function speed(){return Math.hypot(game.vx,game.vy);}
function normalize(x,y){const n=Math.hypot(x,y);return n?{x:x/n,y:y/n}:{x:0,y:0};}

// Moss & Moon: a compact, offline farm-and-action-RPG layer.
// These systems share the original character controller, sprite atlas and spellbook.
// The entire cast shares the witch's 48 × 56 cell, 24/49 foot origin, and
// 1:1 pixel grid. Each type has eight idle and eight walk frames in each of
// eight facings (west-facing views are mirrored), baked into two PNG pages.
const CAST_KINDS=['keeper','skeleton','skeleton_ally','blight','ghost','spirit','slime','ice','golem','wisp','cat','raven','little_golem','dummy'];
const castPages=CAST_PAGE_DATA.map(src=>{const im=new Image();im.src=src;return im;});
const CAST_HEIGHT={keeper:37,skeleton:35,skeleton_ally:35,blight:40,ghost:36,spirit:36,slime:25,ice:29,golem:36,wisp:33,cat:20,raven:22,little_golem:21,dummy:38};
function drawCastSprite(kind,pos,actor=null){
 const index=CAST_KINDS.indexOf(kind);if(index<0)return;
 const moving=(actor?.artMoving||0)>0,phase=actor?.artDistance||0;
 const frame=moving?Math.floor(phase/3)%8:Math.floor((game.elapsed+(actor?.id||0)*.17)*5)%8;
 const dir=Math.max(0,DIRS.indexOf(actor?.artFacing||'S'));
 // MM seam S5: MM.art override — 'cast_<kind>_<idle|walk>_<DIR>' or 'cast_<kind>' (anchor = foot point).
 if(window.MM?.art){const base='cast_'+kind,full=base+'_'+(moving?'walk':'idle')+'_'+DIRS[dir];if(mmArt(full,pos.x,pos.y,{frame})||mmArt(base,pos.x,pos.y,{frame}))return;}
 const page=castPages[Math.floor(index/7)];if(!page.complete||!page.naturalWidth)return;
 const row=(index%7)*16+(moving?8:0)+dir;
 ctx.drawImage(page,frame*FRAME_W,row*FRAME_H,FRAME_W,FRAME_H,pos.x-FOOT_X,pos.y-FOOT_Y,FRAME_W,FRAME_H);
}
function noteCastMotion(actor,dx,dy){
 const p=project(dx,dy),distance=Math.hypot(p.x,p.y);if(distance<.00001)return;
 actor.artFacing=facingFromAngle(Math.atan2(p.y,p.x));actor.artDistance=(actor.artDistance||0)+distance;actor.artMoving=.15;
}
const WIZARDS=[
 {id:'grove',name:'Grove Witch',school:'Nature',starter:'vines',paths:['Thorns','Bark','Cultivation'],desc:'Nature magic is stronger; crops grow 25% faster.'},
 {id:'ember',name:'Ember Wizard',school:'Fire',starter:'ember',paths:['Flame','Cinders','Hearth'],desc:'Fire magic is stronger and warm crops thrive.'},
 {id:'frost',name:'Frost Mage',school:'Frost',starter:'frost',paths:['Ice','Winter','Preservation'],desc:'Frost magic is stronger and chills enemies.'},
 {id:'storm',name:'Stormcaller',school:'Storm',starter:'spark',paths:['Lightning','Cloud','Tempest'],desc:'Storm magic is stronger, especially against wet enemies.'},
 {id:'tide',name:'Tide Mage',school:'Water',starter:'tide',paths:['Wave','Tides','Irrigation'],desc:'Water magic is stronger; rain helps your garden.'},
 {id:'earth',name:'Geomancer',school:'Earth',starter:'earth',paths:['Stone','Bulwark','Minerals'],desc:'Earth magic is stronger and stone wards hit harder.'},
 {id:'sun',name:'Sun Cleric',school:'Sun',starter:'nova',paths:['Radiance','Grace','Daylight'],desc:'Sun magic is stronger and potions restore extra health.'},
 {id:'moon',name:'Moon Witch',school:'Moon',starter:'mirage',paths:['Lunar','Veil','Nightbloom'],desc:'Create a mirage; moonflowers grow faster at night.'},
 {id:'necro',name:'Necromancer',school:'Necromancy',starter:'skeleton',paths:['Bone','Soul','Grave'],desc:'Raise skeletons, launch bone spears, and siphon health.'},
 {id:'beast',name:'Beast Wizard',school:'Spirit',starter:'fairy',paths:['Pack','Hide','Bond'],desc:'Spirit spells are stronger; familiars attack faster.'},
 {id:'alchemy',name:'Alchemist',school:'Nature',starter:'poison',paths:['Venom','Remedy','Botany'],desc:'Nature magic is stronger; brewing yields extra potions.'},
 {id:'rune',name:'Runecaster',school:'Arcane',starter:'missile',paths:['Runes','Ward','Infusion'],desc:'Arcane magic is stronger and socketed runes add power.'},
 {id:'shadow',name:'Shadow Mage',school:'Shadow',starter:'cloak',paths:['Night','Mist','Secrets'],desc:'Hide with shadow magic; enemies drop more gold.'},
 {id:'time',name:'Time Mage',school:'Arcane',starter:'rewind',paths:['Flux','Shelter','Harvest'],desc:'Rewind damage; crops grow a little faster.'},
 {id:'star',name:'Star Wizard',school:'Astral',starter:'star',paths:['Stars','Orbit','Comet'],desc:'Astral magic is stronger; starlight guides your attacks.'},
 {id:'summoner',name:'Summoner',school:'Summoning',starter:'wisp',paths:['Calling','Bond','Conjuring'],desc:'Call wisps and golems; summoned allies deal more damage.'},
 {id:'voodoo',name:'Voodoo-inspired Spirit Weaver',school:'Voodoo',starter:'hex',paths:['Charms','Ancestors','Offerings'],desc:'Use fictional spirit charms and an ancestral blessing.'}
];
const SEED_TYPES={
 wheat:{name:'Wheat',color:'#dfc77c',season:'Summer',time:24},
 ember:{name:'Ember pepper',color:'#e17f56',season:'Summer',time:28},
 frost:{name:'Frost berry',color:'#a6d9ed',season:'Winter',time:30},
 moon:{name:'Moonflower',color:'#c6aedb',season:'Autumn',time:30}
};
const REGIONS={
 grove:{name:'Moonflower Grove',tint:null,mob:'slime',level:1},
 forest:{name:'Blighted Forest',tint:'rgba(65,82,57,.20)',mob:'blight',level:2},
 swamp:{name:'Whispering Swamp',tint:'rgba(58,105,93,.25)',mob:'ghost',level:3},
 mountain:{name:'Frostpeak',tint:'rgba(150,192,212,.32)',mob:'ice',level:4},
 crypt:{name:'Old Crypt',tint:'rgba(65,54,76,.32)',mob:'skeleton',level:5},
 sky:{name:'Starfall Island',tint:'rgba(146,122,181,.23)',mob:'spirit',level:6}
};
const SEASONS=['Spring','Summer','Autumn','Winter'];
const FAMILIARS={none:'No familiar',cat:'Lucky cat',raven:'Raven',golem:'Little golem'};
const gameUI=id=>uiEl(id,/Select$|^p2(Class|Spell)$/.test(id)?'select':'div'); // MM seam S1
const defaultPlots=()=>Array.from({length:6},(_,i)=>({x:7+(i%3),y:11+Math.floor(i/3),seed:null,growth:0,watered:false}));
function newWorld(){return {
 cls:'grove',region:'grove',mode:'outside',floor:0,riftUnlocked:false,modifier:'',
 day:1,time:.18,weather:'Clear',lastRaid:0,gold:85,hp:100,mana:100,ward:0,cloak:0,lastDamage:0,stars:0,level:1,xp:0,points:1,
 skillByClass:{},seed:'wheat',seeds:{wheat:4,ember:2,frost:2,moon:2},harvest:{wheat:0,ember:0,frost:0,moon:0},
 potions:2,bombs:0,runes:1,gear:[],equipped:null,plots:defaultPlots(),wards:[],familiar:'cat',broom:0,
 harvested:0,kills:0,requests:0,lootMode:'shared',coop:false,p2Class:'summoner',p2Spell:'wisp'
};}
let world=newWorld();
let enemies=[],lootDrops=[],allies=[],party=[],particles=[],bursts=[],dungeonBlocks=[];
const familiarSprite={x:10.5,y:9.2};
let worldId=1,worldAutosave=0,uiClock=0,familiarClock=0,touchPlayer=1;
function currentWizard(){return WIZARDS.find(c=>c.id===world.cls)||WIZARDS[0];}
function ranks(){return world.skillByClass[world.cls]||(world.skillByClass[world.cls]=[0,0,0]);}
function heroMaxHP(){const item=world.gear[world.equipped-1];return 100+ranks()[1]*20+(item?.affix==='Vitality'?15:0);}
function season(){return SEASONS[Math.floor((world.day-1)/3)%4];}
function isNight(){return world.time>=.68||world.time<.10;}
function weatherFor(day){return ['Clear','Rain','Clear','Wind','Rain','Clear'][((day-1)%6+6)%6];}
function screenDistance(a,b){const p=project(a.x,a.y),q=project(b.x,b.y);return Math.hypot(q.x-p.x,q.y-p.y);}
function awardXP(amount){
 world.xp+=amount;
 while(world.xp>=world.level*45){world.xp-=world.level*45;world.level++;world.points++;world.hp=heroMaxHP();mmEmit('levelup',{level:world.level});message('Level '+world.level+'! A skill point is ready.');} // MM seam S4
}
function addParticles(target,color,core,count=16,power=1){
 const ps=window.MM?.settings?.particleScale?.()??1; // MM seam S7: settings-aware particle count and cap
 count=Math.round(count*ps);
 for(let i=0;i<count;i++){
  const a=(i/count)*Math.PI*2+Math.random()*.3,s=(9+Math.random()*24)*power,life=.35+Math.random()*.45;
  particles.push({x:target.x,y:target.y,ox:0,oy:-18,vx:Math.cos(a)*s,vy:Math.sin(a)*s-8,life,ttl:life,color:i%3?color:core,size:i%4?2:3});
 }
 const cap=Math.round(220*ps);if(particles.length>cap)particles.splice(0,particles.length-cap); // MM seam S7
 if(ps>0){bursts.push({x:target.x,y:target.y,life:.46,ttl:.46,color,core});if(bursts.length>Math.max(4,Math.round(20*ps)))bursts.shift();}
}
function spellMultiplier(spell,actor,target){
 const wizard=actor&&actor!==game?(WIZARDS.find(c=>c.id===actor.cls)||currentWizard()):currentWizard();
 let factor=1+(actor&&actor!==game?0:ranks()[0]*.10);
 if(spell.school===wizard.school)factor+=.25;
 if((actor===game||world.lootMode==='shared')&&world.equipped&&world.gear[world.equipped-1]){const gear=world.gear[world.equipped-1];factor+=gear.power*.025;if(gear.affix==='Spellpower')factor+=.1;}
 if(spell.school==='Fire'&&world.harvest.ember>0)factor+=.12;
 if(spell.school==='Frost'&&world.harvest.frost>0)factor+=.12;
 if(spell.school==='Moon'&&world.harvest.moon>0)factor+=.12;
 if(spell.school==='Astral')factor+=world.stars*.04;
 if(target?.status?.wet&&spell.school==='Storm')factor+=.5;
 if(world.mode==='rift'&&world.modifier==='Radiant')factor+=.2;
 if(actor&&actor!==game)factor*=1+(actor.power||0)*.025;
 return factor;
}
function nearestEnemy(actor,max=170){
 let best=null,dist=max;
 for(const e of enemies){if(e.hp<=0)continue;const d=screenDistance(actor,e);if(d<dist){dist=d;best=e;}}
 return best;
}
function spellTarget(actor){
 if(world.targetId==='dummy'&&world.region==='grove'&&world.mode==='outside'&&dummy.hp>0)return dummy;
 const chosen=enemies.find(e=>e.id===world.targetId&&e.hp>0);
 if(chosen&&screenDistance(actor,chosen)<220)return chosen;
 const enemy=nearestEnemy(actor,190);
 if(enemy)return enemy;
 return world.region==='grove'&&world.mode==='outside'&&dummy.hp>0?dummy:null;
}
function statusOptions(name){return {
 burn:{time:2.4,tick:.6,period:.6,damage:3,color:'#f69655'},poison:{time:3,tick:.75,period:.75,damage:4,color:'#a2cf71'},
 chill:{time:2.5},shock:{time:1.7},root:{time:2.5},vulnerable:{time:4},wet:{time:3.5}
 }[name];}
function applyStatusTo(target,name){if(!target||target.hp<=0||!name)return;const s=statusOptions(name);if(s)target.status[name]={...s};}
function hitEntity(target,amount,color,source=game){
 if(!target||target.hp<=0||!Number.isFinite(amount)||amount<=0)return;
 if(target===dummy){hitDummy(amount,color);return;}
 const hit=Math.max(1,Math.round(amount*(target.status.vulnerable?1.25:1)));
 target.hp=Math.max(0,target.hp-hit);target.flash=.18;
 mmEmit('hit',{target,amount:hit,color,source,boss:!!target.boss}); // MM seam S4
 numbers.push({value:String(hit),color,life:.9,offset:(numbers.length%3-1)*5,x:target.x,y:target.y});
 if(numbers.length>40)numbers.shift();
 if(target.hp===0&&!target.dead){target.dead=true;world.kills++;awardXP(target.boss?55:12);dropReward(target,source);
  mmEmit('kill',{enemy:target,source,boss:!!target.boss}); // MM seam S4
  if(target.boss){world.riftUnlocked=true;world.bossCleared=bossFloorKey();mmEmit('boss',{phase:'defeated',enemy:target});message('Boss defeated! Rifts are now unlocked.');}} // MM seam: bossCleared stops a saved boss floor from respawning its boss (audit §9 #14)
}
function dropReward(target,source){
 const equipped=world.gear[world.equipped-1],extra=(world.cls==='shadow'?1.3:1)*(world.familiar==='cat'?1.2:1)*(equipped?.affix==='Greed'?1.2:1),amount=Math.round((target.boss?42:8+world.level*2)*extra);
 lootDrops.push({id:worldId++,x:target.x,y:target.y,type:'gold',amount,life:90});
 if(target.boss||Math.random()<.5){
  const roll=Math.random(),rarity=target.boss||roll>.95?'Legendary':roll>.76?'Rare':roll>.43?'Magic':'Common';
  const power=(target.boss?5:1)+world.level+({Common:0,Magic:1,Rare:3,Legendary:5}[rarity]);
  const names=['Wand','Robe','Ring','Charm'],slot=names[Math.floor(Math.random()*names.length)];
  const affixes=['Vitality','Focus','Harvest','Greed','Spellpower'],affix=affixes[Math.floor(Math.random()*affixes.length)];
  lootDrops.push({id:worldId++,x:target.x+.25,y:target.y-.25,type:'gear',item:{name:rarity+' '+slot+' of '+affix,rarity,power,affix,sockets:0,maxSockets:rarity==='Legendary'?2:1},life:90});
 }
 if(Math.random()<.20)lootDrops.push({id:worldId++,x:target.x-.2,y:target.y+.2,type:'rune',life:90});
}
function pickup(drop,actor=game){
 if(drop.type==='gold'){
  if(world.lootMode==='individual'&&actor!==game)actor.gold=(actor.gold||0)+drop.amount;else world.gold+=drop.amount;
  message('Picked up '+drop.amount+' gold');
 }else if(drop.type==='rune'){world.runes++;message('Found a rune');}
 else if(drop.type==='gear'){
  if(world.lootMode==='individual'&&actor!==game){actor.power=Math.max(actor.power||0,drop.item.power);message('Player '+actor.id+' found '+drop.item.name);}
  else{world.gear.push(drop.item);if(world.gear.length>40){world.gear.shift();world.equipped=world.equipped>1?world.equipped-1:null;}message('Found '+drop.item.name);}
 }
 mmEmit('pickup',{type:drop.type,amount:drop.amount,item:drop.item,actor}); // MM seam S4
 drop.life=0;
}
function makeEnemy(type,x,y,boss=false){
 let hp=(boss?210:45)+world.level*8+world.floor*12+(world.mode==='rift'?35:0);if(world.mode==='rift'&&world.modifier==='Fortified')hp=Math.round(hp*1.35);
 const bossNames={grove:'Wicker King',forest:'Blight Guardian',swamp:'Mire Mother',mountain:'Frost Giant',crypt:'Bone Regent',sky:'Star Warden'};
 return {id:worldId++,type,x,y,hp,maxHP:hp,boss,name:boss?(bossNames[world.region]||'Rift Guardian'):'',status:{},flash:0,attack:1+Math.random(),special:3,dead:false,age:Math.random()*5};
}
function buildDungeonLayout(){
 dungeonBlocks=[];if(world.mode==='outside')return;
 for(let x=2;x<19;x+=2)for(let y=2;y<19;y+=2){
  if(Math.abs(x-10)<2||Math.abs(y-10)<2)continue;
  if(hash(x,y,(world.dungeonSeed||1)+world.floor*41)>.76)dungeonBlocks.push({x,y,variant:Math.floor(hash(y,x,world.floor)*3)});
 }
}
function blockedAt(x,y){return world.mode!=='outside'&&dungeonBlocks.some(b=>Math.abs(x-b.x)<.55&&Math.abs(y-b.y)<.55);}
function moveActor(actor,dx,dy){
 const ox=actor.x,oy=actor.y;
 let nx=clamp(actor.x+dx,.6,19.4),ny=clamp(actor.y+dy,.6,19.4);
 if(blockedAt(nx,ny)){if(!blockedAt(nx,actor.y))ny=actor.y;else if(!blockedAt(actor.x,ny))nx=actor.x;else{nx=actor.x;ny=actor.y;}}
 actor.x=nx;actor.y=ny;noteCastMotion(actor,nx-ox,ny-oy);
}
function spawnGroup(type,count,boss=false,raid=false){
 for(let i=0;i<count;i++){
  const a=(i/count)*Math.PI*2+Math.random()*.2,r=3+Math.random()*2;
  let x=clamp(10+Math.cos(a)*r,1,19),y=clamp(10+Math.sin(a)*r,1,19);if(blockedAt(x,y)){x=10+Math.cos(a)*2;y=10+Math.sin(a)*2;}
  const enemy=makeEnemy(type,x,y,boss&&i===0);enemy.raid=raid;enemies.push(enemy);
  if(enemy.boss)mmEmit('boss',{phase:'spawn',enemy,restored:mmQuiet>0}); // MM seam S4
 }
}
function spawnAlly(type,owner=game){
 if(allies.length>=4)allies.shift();
 const offset=.45+(allies.length%3)*.22;
 allies.push({id:worldId++,type,x:clamp(owner.x+offset,1,19),y:clamp(owner.y-offset,1,19),life:type==='mirage'?12:35,hp:type==='mirage'?40:1,cooldown:.5,farmCooldown:0,owner});
 message((type==='skeleton'?'Skeleton':type==='wisp'?'Wisp':type==='mirage'?'Moon mirage':'Golem')+' joined you');
}
function resetPlayer(){
 // MM seam S4/defeat: with MM, death enters the 'defeat' state and MM.game.respawnHome() -> respawnAtHome() recovers.
 if(mmPaused())return; // already defeated (or paused) earlier this frame
 mmEmit('death',{region:world.region,mode:world.mode,floor:world.floor});
 if(window.MM?.game?.handleDeath?.()===true)return;
 respawnAtHome(12);message('You wake at the farm. Lost 12 gold.');
}
function respawnAtHome(goldLoss=12){ // MM seam: original resetPlayer body, gold loss parameterised
 world.gold=Math.max(0,world.gold-goldLoss);world.hp=heroMaxHP();world.mana=100;game.target=null;game.transition=null;
 world.region='grove';world.mode='outside';world.floor=0;enemies=[];lootDrops=[];world.targetId=null;
 game.x=9.7;game.y=10;game.vx=game.vy=0;const p=project(game.x,game.y);game.camX=p.x;game.camY=p.y;
 familiarSprite.x=game.x+.55;familiarSprite.y=game.y-.55;party.forEach((a,i)=>{const d=(i%2?1:-1)*(.75+Math.floor(i/2)*.4);a.x=game.x+d;a.y=game.y-d;});allies.forEach(a=>{a.x=game.x+.5;a.y=game.y-.5;});dungeonBlocks=[];drawGround();
}
function tendPlot(plot){
 if(world.region!=='grove'||world.mode!=='outside'){message('Your farm is in Moonflower Grove');return false;}
 const p=plot||world.plots.reduce((best,x)=>!best||screenDistance(game,x)<screenDistance(game,best)?x:best,null);
 if(!p||screenDistance(game,p)>52){message('Walk closer to a garden plot');return false;}
 if(!p.seed){
  const seed=world.seed;if((world.seeds[seed]||0)<1){message('Out of seeds — buy more in the village');return false;}
  world.seeds[seed]--;p.seed=seed;p.growth=0;p.health=100;p.watered=world.weather==='Rain';mmEmit('plant',{plot:p,seed});message('Planted '+SEED_TYPES[seed].name);return true; // MM seam S4
 }
 if(p.growth>=100){
  const mutated=Math.random()<.12,amount=mutated?2:1;world.harvest[p.seed]+=amount;world.harvested+=amount;awardXP(mutated?12:7);mmEmit('harvest',{plot:p,seed:p.seed,amount,mutated}); // MM seam S4
  message((mutated?'Rare harvest! ':'Harvested ')+amount+' '+SEED_TYPES[p.seed].name);p.seed=null;p.growth=0;p.watered=false;return true;
 }
 if(!p.watered){p.watered=true;mmEmit('water',{plot:p});message('Watered '+SEED_TYPES[p.seed].name);return true;} // MM seam S4
 message(SEED_TYPES[p.seed].name+' growing: '+Math.floor(p.growth)+'%');return false;
}
function buildFarmWard(){
 if(world.region!=='grove'||world.mode!=='outside'){message('Build wards at your farm');return;}
 if(world.wards.length>=3){message('Maximum of three wards');return;}
 if(world.gold<40){message('A ward costs 40 gold');return;}
 world.gold-=40;world.wards.push({x:game.x+.55,y:game.y+.55,cooldown:.5,power:0});message('Farm ward built');
}
function empowerWard(){if(world.region!=='grove'||world.mode!=='outside'){message('Return to your farm');return;}const ward=world.wards.reduce((a,b)=>!a||screenDistance(game,b)<screenDistance(game,a)?b:a,null);if(!ward){message('Build a ward first');return;}if(!world.runes){message('Find or buy a rune first');return;}if((ward.power||0)>=3){message('Ward is fully empowered');return;}world.runes--;ward.power=(ward.power||0)+1;message('Ward empowered to rank '+ward.power);}
function brew(){if(world.harvest.wheat<2){message('Brewing needs 2 harvested wheat');return;}world.harvest.wheat-=2;world.potions+=world.cls==='alchemy'?2:1;message('Potion brewed');}
function brewBomb(){if(world.harvest.ember<1){message('A bomb needs 1 ember pepper');return;}world.harvest.ember--;world.bombs++;message('Ember bomb crafted');}
function throwBomb(){const target=spellTarget(game);if(castCooldown>0)return;if(!world.bombs){message('Craft a bomb from an ember pepper first');return;}if(!target||screenDistance(game,target)>220){message('Move closer to a target');return;}world.bombs--;castCooldown=.32;const base=SPELLS.find(s=>s.id==='fireball');if(effects.length>=32)effects.shift();effects.push({spell:{...base,id:'bomb',damage:48},elapsed:0,from:{x:game.x,y:game.y,height:game.height},target,caster:game,hitIndex:0});mmEmit('cast',{actor:game,spell:{...base,id:'bomb',school:'Fire'},target}); /* MM seam S4 */addParticles(game,'#f67540','#ffe29a',10,.6);message('Ember bomb thrown');}
function drink(){if(world.potions<1){message('No potions — brew more from wheat');return;}if(world.hp>=heroMaxHP()&&world.mana>=95){message('Health and mana are full');return;}world.potions--;world.hp=Math.min(heroMaxHP(),world.hp+(world.cls==='sun'?55:40));world.mana=Math.min(100,world.mana+25);message('Potion restores health and mana');}
function sellHarvest(){let count=0;for(const k of Object.keys(world.harvest)){count+=world.harvest[k];world.harvest[k]=0;}if(!count){message('No crops to sell');return;}const value=count*(world.cls==='frost'?11:9);world.gold+=value;message('Sold '+count+' crops for '+value+' gold');}
function upgradeSkill(index){if(world.points<1){message('Earn a level to gain a skill point');return;}const r=ranks();if(r[index]>=3){message('That path is already at rank 3');return;}world.points--;r[index]++;if(index===1)world.hp=Math.min(heroMaxHP(),world.hp+20);message(currentWizard().paths[index]+' rank '+r[index]);}
function equipSelected(){const i=Number(gameUI('gearSelect').value);if(!Number.isInteger(i)||i<0||i>=world.gear.length){message('Find equipment in dungeons first');return;}world.equipped=i+1;message('Equipped '+world.gear[i].name);}
function socketRune(){const gear=world.gear[world.equipped-1];if(!gear){message('Equip an item first');return;}if(!world.runes){message('Find or buy a rune first');return;}if(gear.sockets>=gear.maxSockets){message('That item has no empty sockets');return;}world.runes--;gear.sockets++;gear.power+=4;message('Rune socketed: +4 power');}
function turnInQuest(){const h=(world.requests+1)*2,k=(world.requests+1)*2;if(world.harvested<h||world.kills<k){message('Request needs '+h+' harvests and '+k+' enemy defeats');return;}world.requests++;world.gold+=45+(world.day%3===0?10:0);awardXP(30);mmEmit('quest',{requests:world.requests}); /* MM seam S4 */message(world.requests===1?'Village shop restored! Seeds now cost less.':world.requests===2?'Village banner raised! Runes now cost less.':'Village request complete: +45 gold');}
function buySeeds(){const cost=world.requests>=1?9:12;if(world.gold<cost){message('Seeds cost '+cost+' gold');return;}world.gold-=cost;world.seeds[world.seed]+=3;message('Bought 3 '+SEED_TYPES[world.seed].name+' seeds');}
function buyRune(){const cost=world.requests>=2?24:30;if(world.gold<cost){message('A rune costs '+cost+' gold');return;}world.gold-=cost;world.runes++;message('Bought a rune');}
function upgradeBroom(){const cost=55+world.broom*50;if(world.broom>=2){message('Broom is fully upgraded');return;}if(world.gold<cost){message('Broom upgrade costs '+cost+' gold');return;}world.gold-=cost;world.broom++;message('Broom upgraded to level '+world.broom);}
function discoverStar(){if(!isNight()){message('Constellations appear at night');return;}if(world.stars>=3){message('All three constellations discovered');return;}world.stars++;awardXP(12);message('Constellation discovered: Astral magic +4%');}
function goRegion(id){
 if(!REGIONS[id])return;if(id==='sky'&&world.broom<2){message('Starfall Island needs a level 2 broom');return;}
 world.region=id;world.mode='outside';world.floor=0;world.targetId=null;enemies=[];lootDrops=[];dungeonBlocks=[];
 game.x=9.7;game.y=10;game.vx=game.vy=0;const p=project(game.x,game.y);game.camX=p.x;game.camY=p.y;
 familiarSprite.x=game.x+.55;familiarSprite.y=game.y-.55;party.forEach((a,i)=>{const d=(i%2?1:-1)*(.75+Math.floor(i/2)*.4);a.x=game.x+d;a.y=game.y-d;});allies.forEach(a=>{a.x=game.x+.5;a.y=game.y-.5;});
 if(id!=='grove')spawnGroup(REGIONS[id].mob,3+Math.min(1,Math.floor((world.level-1)/2)));drawGround();mmEmit('region',{id});message('Travelled to '+REGIONS[id].name); // MM seam S4
}
function enterDungeon(rift=false){
 if(rift&&!world.riftUnlocked){message('Defeat a dungeon boss to unlock rifts');return;}
 world.mode=rift?'rift':'dungeon';world.floor=1;world.dungeonSeed=Math.floor(Math.random()*1000000);world.targetId=null;world.modifier=rift?['Fortified','Frenzy','Radiant'][Math.floor(Math.random()*3)]:'';
 enemies=[];lootDrops=[];buildDungeonLayout();spawnGroup(REGIONS[world.region].mob,4);drawGround();mmEmit('dungeon',{mode:world.mode,floor:1,modifier:world.modifier,region:world.region}); /* MM seam S4 */message(rift?'Entered a '+world.modifier+' rift':'Entered the dungeon');
}
function advanceFloor(){
 if(world.mode==='outside'){message('Enter a dungeon first');return;}
 if(enemies.some(e=>e.hp>0)){message('Defeat the remaining enemies first');return;}
 world.floor++;world.targetId=null;const boss=world.floor%3===0;enemies=[];buildDungeonLayout();spawnGroup(REGIONS[world.region].mob,boss?3:Math.min(7,3+world.floor),boss);drawGround();mmEmit('dungeon',{mode:world.mode,floor:world.floor,boss,modifier:world.modifier,region:world.region}); // MM seam S4
 message(boss?'A powerful guardian appears!':'Entered floor '+world.floor);
}
function collectNearby(){let count=0;for(const drop of lootDrops)if(drop.life>0&&screenDistance(game,drop)<55){pickup(drop,game);count++;}if(!count)message('Move closer to dropped loot');}
function setClass(id){const c=WIZARDS.find(w=>w.id===id);if(!c)return;world.cls=id;const i=SPELLS.findIndex(s=>s.id===c.starter);if(i>=0)chooseSpell(i);world.hp=Math.min(world.hp,heroMaxHP());message(c.name+' chosen');}
function updateWorld(dt){
 world.time+=dt/120;
 if(world.time>=1){world.time-=1;world.day++;world.weather=weatherFor(world.day);mmEmit('day',{day:world.day,season:season(),weather:world.weather});message('Day '+world.day+' · '+season()+' · '+world.weather);} // MM seam S4
 // MM seam (audit §9 #2 fix): a night spans two day numbers, so raids are keyed by the night (the day it began).
 const raidNight=world.time<.10?world.day-1:world.day;
 if(world.region==='grove'&&world.mode==='outside'&&isNight()&&world.lastRaid!==raidNight&&world.lastRaid<raidNight){world.lastRaid=raidNight;world.targetId=null;spawnGroup('blight',2+Math.min(3,world.level),false,true);mmEmit('raid',{day:world.day,night:raidNight});message('Night raid! Defend your farm.');}
 world.mana=Math.min(100,world.mana+dt*(8+ranks()[2]*2+(world.gear[world.equipped-1]?.affix==='Focus'?3:0)));
 world.cloak=Math.max(0,(world.cloak||0)-dt);
 for(const plot of world.plots){
  if(!plot.seed)continue;if(world.weather==='Rain')plot.watered=true;
  if(plot.watered&&plot.growth<100){let rate=100/SEED_TYPES[plot.seed].time*(1+ranks()[2]*.12);
   if(world.cls==='grove')rate*=1.25;if(world.cls==='time')rate*=1.15;if(world.cls==='ember'&&plot.seed==='ember')rate*=1.25;if(world.cls==='moon'&&plot.seed==='moon'&&isNight())rate*=1.4;
   if(SEED_TYPES[plot.seed].season===season())rate*=1.25;if(world.familiar==='golem')rate*=1.1;if(world.gear[world.equipped-1]?.affix==='Harvest')rate*=1.15;plot.growth=Math.min(100,plot.growth+dt*rate);}
 }
 for(const enemy of enemies){
  if(enemy.hp<=0)continue;enemy.age+=dt;enemy.artMoving=Math.max(0,(enemy.artMoving||0)-dt);enemy.flash=Math.max(0,enemy.flash-dt);enemy.attack-=dt;
  for(const [name,s] of Object.entries(enemy.status)){s.time-=dt;if(s.damage){s.tick-=dt;if(s.tick<=0&&s.time>=-dt){hitEntity(enemy,s.damage,s.color);s.tick+=s.period;}}if(s.time<=0)delete enemy.status[name];}
  if(enemy.hp<=0)continue;
  const candidates=(world.cloak>0?[]:[game]).concat(party.filter(p=>p.hp>0),allies.filter(a=>a.type==='mirage'&&a.hp>0));
  let hero=candidates.reduce((best,p)=>!best||screenDistance(enemy,p)<screenDistance(enemy,best)?p:best,null);
  if(enemy.raid){const crop=world.plots.filter(p=>p.seed).reduce((best,p)=>!best||screenDistance(enemy,p)<screenDistance(enemy,best)?p:best,null);if(crop&&(!hero||screenDistance(enemy,crop)<screenDistance(enemy,hero)*.85))hero=crop;}
  if(!hero)continue;
  const from=project(enemy.x,enemy.y),to=project(hero.x,hero.y),distance=Math.hypot(to.x-from.x,to.y-from.y);
  if(enemy.boss){enemy.special-=dt;if(enemy.special<=0){enemy.special=4;addParticles(enemy,'#d49bce','#ffe3bf',18,1.2);if(distance<55&&hero===game){let pulse=9;if(world.ward>0){const used=Math.min(world.ward,pulse);world.ward-=used;pulse-=used;}world.lastDamage=pulse;world.hp-=pulse;mmEmit('hurt',{amount:pulse,from:enemy});message(enemy.name+' releases a pulse!');if(world.hp<=0){resetPlayer();break;}}}}
  if(distance>23){let sx=to.x-from.x,sy=to.y-from.y;const direction=normalize(sx,sy);
   for(const other of enemies){if(other===enemy||other.hp<=0)continue;const op=project(other.x,other.y),d=Math.hypot(from.x-op.x,from.y-op.y);if(d>0&&d<18){sx+=(from.x-op.x)/d*18;sy+=(from.y-op.y)/d*18;}}
   const steer=normalize(sx,sy);let pace=(enemy.boss?13:14)+(world.mode==='rift'&&world.modifier==='Frenzy'?7:0);if(enemy.status.chill)pace*=.5;if(enemy.status.root)pace=0;
   const m=unproject(steer.x*pace*dt,steer.y*pace*dt);const ox=enemy.x,oy=enemy.y;moveActor(enemy,m.x,m.y);if(enemy.x===ox&&enemy.y===oy){const side=unproject(-direction.y*pace*dt*.7,direction.x*pace*dt*.7);moveActor(enemy,side.x,side.y);}
  }else if(enemy.attack<=0){enemy.attack=enemy.boss?1.2:1.8;let damage=enemy.boss?14:4;
   if(hero.seed){hero.health=(hero.health??100)-damage*(world.cls==='sun'?1:2);if(hero.health<=0){hero.seed=null;hero.growth=0;hero.watered=false;message('A raider destroyed a crop');}}
   else if(hero.type==='mirage'){hero.hp-=damage;if(hero.hp<=0)hero.life=0;}
   else if(hero===game){if(world.ward>0){const used=Math.min(world.ward,damage);world.ward-=used;damage-=used;}world.lastDamage=damage;world.hp-=damage;mmEmit('hurt',{amount:damage,from:enemy});if(world.hp<=0){resetPlayer();break;}} /* MM seam S4 */
   else{hero.lastDamage=damage;hero.hp-=damage;if(hero.hp<=0){hero.hp=65;hero.x=game.x+.5;hero.y=game.y+.5;message('Player '+hero.id+' recovered');}}addParticles(hero,'#ee8b77','#ffdbbf',6,.7);}
 }
 enemies=enemies.filter(e=>!e.dead);
 for(const ally of allies){
  ally.life-=dt;ally.cooldown-=dt;ally.artMoving=Math.max(0,(ally.artMoving||0)-dt);if(ally.type==='mirage')continue;
  ally.farmCooldown-=dt;if(ally.type==='skeleton'&&world.region==='grove'&&world.mode==='outside'&&ally.farmCooldown<=0){const plant=world.plots.find(p=>p.seed&&!p.watered&&screenDistance(ally,p)<100);if(plant){plant.watered=true;ally.farmCooldown=3;message('Skeleton watered a crop');}}
  const enemy=nearestEnemy(ally,140),goal=enemy||game,from=project(ally.x,ally.y),to=project(goal.x,goal.y),d=Math.hypot(to.x-from.x,to.y-from.y);
  if(d>(enemy?22:25)){const v=normalize(to.x-from.x,to.y-from.y),m=unproject(v.x*25*dt,v.y*25*dt);ally.x+=m.x;ally.y+=m.y;noteCastMotion(ally,m.x,m.y);}
  if(enemy&&d<50&&ally.cooldown<=0){ally.cooldown=ally.type==='wisp'?.7:1.1;const summoner=ally.owner===game?world.cls==='summoner':ally.owner?.cls==='summoner';const power=(ally.type==='golem'?16:10)*(summoner?1.4:1);hitEntity(enemy,power,'#d2c3f5',ally.owner);addParticles(enemy,'#b99bdb','#fff0f6',5,.6);}
 }
 allies=allies.filter(a=>a.life>0);
 familiarClock-=dt;
 if(world.familiar!=='none'&&familiarClock<=0){const enemy=nearestEnemy(game,100);if(enemy){familiarClock=world.cls==='beast'?1.2:1.8;hitEntity(enemy,world.familiar==='golem'?12:7,'#f1d496');addParticles(enemy,'#e9c283','#fff2c9',4,.5);}}
 for(const ward of world.wards){ward.cooldown-=dt;if(world.region==='grove'&&world.mode==='outside'&&ward.cooldown<=0){const enemy=nearestEnemy(ward,75);if(enemy){ward.cooldown=world.cls==='storm'?.65:1.0;hitEntity(enemy,(world.cls==='earth'?18:12)+(ward.power||0)*5,'#b9d695');addParticles(enemy,'#bbdf99','#f5ffce',4,.5);}}}
 for(const drop of lootDrops){drop.life-=dt;if(drop.life<=0)continue;const who=[game,...party].find(p=>screenDistance(p,drop)<15);if(who)pickup(drop,who);}
 lootDrops=lootDrops.filter(d=>d.life>0);
 for(const part of particles){part.life-=dt;part.ox+=part.vx*dt;part.oy+=part.vy*dt;part.vy+=18*dt;}particles=particles.filter(p=>p.life>0);
 for(const b of bursts)b.life-=dt;bursts=bursts.filter(b=>b.life>0);
 const fp=project(familiarSprite.x,familiarSprite.y),follow=project(game.x+.55,game.y-.55),fv=normalize(follow.x-fp.x,follow.y-fp.y);
 familiarSprite.artMoving=Math.max(0,(familiarSprite.artMoving||0)-dt);
 if(Math.hypot(follow.x-fp.x,follow.y-fp.y)>4){const m=unproject(fv.x*24*dt,fv.y*24*dt);moveActor(familiarSprite,m.x,m.y);}
 updateParty(dt);worldAutosave+=dt;if(worldAutosave>8){worldAutosave=0;if(!window.MM?.save)saveWorld(true);} // MM seam S8: with MM, boot.js autosaves at safe moments
}

function newCompanion(id){
 const cls=id===2?world.p2Class:id===3?'storm':'sun',wizard=WIZARDS.find(c=>c.id===cls)||WIZARDS[0];
 const requested=id===2?world.p2Spell:wizard.starter,spellIndex=Math.max(0,SPELLS.findIndex(s=>s.id===requested));
 const offset=(id%2?1:-1)*(.75+Math.floor((id-2)/2)*.4);
 return {id,cls,spellIndex,x:game.x+offset,y:game.y-offset,vx:0,vy:0,heading:Math.PI/2,facing:'S',height:0,mounted:false,animation:'idle',frame:0,distance:0,hp:65,maxHP:65,mana:100,gold:0,power:0,cooldown:0,castRemaining:0,buttonA:false,buttonB:false}; // MM seam: own mana pool (audit §9 #3)
}
function toggleLocalCoop(){
 world.coop=!world.coop;party=world.coop?[newCompanion(2)]:[];touchPlayer=1;gameUI('touchActor').hidden=!world.coop;
 spellSelect.value=String(spellIndex);
 message(world.coop?'Local player 2 joined':'Local co-op ended');
}
function updateParty(dt){
 if(!world.coop)return;
 let pads=[];
 try{if(typeof navigator!=='undefined'&&navigator.getGamepads)pads=Array.from(navigator.getGamepads()).filter(Boolean).slice(0,3);}catch(_error){}
 while(party.length<Math.min(3,Math.max(1,pads.length)))party.push(newCompanion(party.length+2));
 for(let i=0;i<party.length;i++){
  const p=party[i],pad=pads[i];let x=0,y=0;
  if(i===0){x=(keys.has('arrowright')?1:0)-(keys.has('arrowleft')?1:0);y=(keys.has('arrowdown')?1:0)-(keys.has('arrowup')?1:0);
   if(touchPlayer===2)for(const d of touchDirections.values()){x+=vec[d][0];y+=vec[d][1];}}
  if(pad){const ax=pad.axes?.[0]||0,ay=pad.axes?.[1]||0;if(Math.hypot(ax,ay)>.2){x=ax;y=ay;}
   const fire=!!pad.buttons?.[0]?.pressed,broom=!!pad.buttons?.[1]?.pressed;
   if(fire&&!p.buttonA)castSpell(p);if(broom&&!p.buttonB)p.mounted=!p.mounted;p.buttonA=fire;p.buttonB=broom;
  }
  const v=normalize(x,y),top=p.mounted?FLY_SPEED*(1+world.broom*.15):WALK_SPEED;
  const k=1-Math.exp(-(x||y?7:9)*dt);p.vx+=(v.x*top-p.vx)*k;p.vy+=(v.y*top-p.vy)*k;
  const old=project(p.x,p.y),m=unproject(p.vx*dt,p.vy*dt);moveActor(p,m.x,m.y);
  const projected=project(p.x,p.y),anchor=project(game.x,game.y),distance=Math.hypot(projected.x-anchor.x,projected.y-anchor.y);
  if(distance>140){const pull=unproject((projected.x-anchor.x)*(distance-140)/distance,(projected.y-anchor.y)*(distance-140)/distance);p.x-=pull.x;p.y-=pull.y;}
  p.distance+=Math.hypot(projected.x-old.x,projected.y-old.y);p.cooldown=Math.max(0,p.cooldown-dt);p.mana=Math.min(100,(p.mana??100)+dt*8);p.castRemaining=Math.max(0,p.castRemaining-dt);
  const movement=Math.hypot(p.vx,p.vy);if(movement>1){p.heading=Math.atan2(p.vy,p.vx);p.facing=facingFromAngle(p.heading);}
  p.height=p.mounted?13:0;p.animation=p.mounted?(movement>3?'fly':'hover'):(movement>1?'walk':'idle');
  p.frame=p.animation==='walk'?Math.floor(p.distance/2)%8:Math.floor(game.elapsed*(p.mounted?10:8))%8;
  if(p.castRemaining>0){if(p.castFacing)p.facing=p.castFacing;if(!p.mounted&&movement<3){p.animation='cast';p.frame=clamp(Math.floor((.48-p.castRemaining)/.06),0,7);}}
 }
}
function drawFarmPlot(p){
 const v=worldToCanvas(p.x,p.y);
 if(!(window.MM?.art&&mmArt(p.watered?'plot_wet':'plot_dry',v.x,v.y))){ // MM seam S5: plot base art
 diamond(ctx,v.x,v.y,26,13,p.watered?'#987f69':'#ae9170');
 diamond(ctx,v.x,v.y-1,20,9,p.watered?'#b09b7d':'#c3a482');}
 if(!p.seed){fill('#8a785f',v.x-4,v.y-1,3,1);fill('#8a785f',v.x+3,v.y,3,1);return;}
 const stage=Math.floor(p.growth/25),color=SEED_TYPES[p.seed].color;
 if(window.MM?.art&&mmArt('crop_'+p.seed+'_'+stage,v.x,v.y))return; // MM seam S5: crop art 'crop_<seed>_<0..4>'
 if(stage===0){fill('#779a63',v.x-1,v.y-3,2,3);fill('#9bbd7c',v.x-3,v.y-4,3,2);}
 else{fill('#618f5f',v.x-1,v.y-6-stage,2,6+stage);fill('#83ad72',v.x-5,v.y-4-stage,4,3);fill('#83ad72',v.x+2,v.y-5-stage,4,3);if(stage>=2){fill(color,v.x-4,v.y-9-stage,4,4);fill(color,v.x+1,v.y-8-stage,4,4);}if(stage>=4)sparkle(v.x+5,v.y-13,color,2);}
}
function drawWard(ward){const p=worldToCanvas(ward.x,ward.y);if(window.MM?.art&&(mmArt('ward_'+(ward.power||0),p.x,p.y)||mmArt('ward',p.x,p.y)))return; /* MM seam S5 */ellipse(p.x,p.y,7,2,'rgba(42,70,48,.2)');fill('#74674e',p.x-3,p.y-12,6,11);fill('#a5c991',p.x-4,p.y-17,8,7);fill('#e2f5be',p.x-2,p.y-15,4,3);}
function drawDungeonBlock(b){const p=worldToCanvas(b.x,b.y);if(window.MM?.art&&(mmArt('block_'+world.region+'_'+b.variant,p.x,p.y)||mmArt('block_'+b.variant,p.x,p.y)||mmArt('block',p.x,p.y)))return; /* MM seam S5 */ellipse(p.x,p.y,10,3,'rgba(32,31,39,.27)');fill('#55575d',p.x-8,p.y-13,16,12);fill('#7b7e7d',p.x-7,p.y-15,14,4);fill('#969894',p.x-5,p.y-14,6,1);if(b.variant===1){fill('#a18bc1',p.x-2,p.y-21,4,9);fill('#d4bfee',p.x-1,p.y-20,1,5);}else fill('#686b6a',p.x-7,p.y-8,5,1);}
function drawMonster(e){
 const p=worldToCanvas(e.x,e.y),kind=CAST_HEIGHT[e.type]?e.type:'slime';
 const width=(kind==='slime'||kind==='ice')?10:8;
 ellipse(p.x,p.y,width,2.5,'rgba(41,56,40,.24)');
 ctx.save();if(e.flash>0)ctx.filter='brightness(1.45)';drawCastSprite(kind,p,e);ctx.restore();
 // Bosses wear a hand-pixelled crown at the same pixel pitch as the rest of
 // the cast; fractional sprite scaling would give them mismatched pixels.
 const top=p.y-CAST_HEIGHT[kind];
 if(e.boss){
  fill('#655440',p.x-6,top-6,12,5);fill('#d0ae70',p.x-5,top-5,10,3);
  fill('#e8d49b',p.x-5,top-8,2,4);fill('#e8d49b',p.x-1,top-9,2,4);fill('#e8d49b',p.x+3,top-8,2,4);
  fill('#f6e2af',p.x-1,top-4,2,1);
 }
 const barY=top-(e.boss?13:6);
 fill('#384d41',p.x-12,barY,24,3);fill(e.boss?'#e38f67':'#bedb97',p.x-11,barY+1,Math.max(0,Math.round(22*e.hp/e.maxHP)),1);
 if(e.boss&&window.MM?.baselineDraw?.labels!==false){ctx.fillStyle='#f6dfae';ctx.font='bold 6px monospace'; // MM seam: label gate
 ctx.textAlign='center';ctx.fillText(e.name,p.x,barY-3);ctx.textAlign='start';}
}
function drawSummon(a){
 const p=worldToCanvas(a.x,a.y);ellipse(p.x,p.y,7,2,'rgba(42,60,50,.18)');
 if(a.type==='mirage'){
  const source=recoloredAtlas||atlasImages[chosenLook.style];
  if(source&&(source===recoloredAtlas||(source.complete&&source.naturalWidth))){ctx.save();ctx.globalAlpha=.48;ctx.drawImage(source,0,4*FRAME_H,FRAME_W,FRAME_H,p.x-FOOT_X,p.y-FOOT_Y,FRAME_W,FRAME_H);ctx.restore();}
  sparkle(p.x,p.y-35,'#dbe6ff',3);
 }else{
  const kind=a.type==='skeleton'?'skeleton_ally':a.type==='golem'?'golem':'wisp';
  drawCastSprite(kind,p,a);
 }
}

function drawCompanion(p){
 const v=worldToCanvas(p.x,p.y),alternate=atlasImages[p.id%2?'neutral':'masculine'],source=alternate&&alternate.complete&&alternate.naturalWidth?alternate:(recoloredAtlas||atlasImages[chosenLook.style]);ellipse(v.x,v.y,8,2,'rgba(42,57,46,.2)');
 if(source&&(source===recoloredAtlas||(source.complete&&source.naturalWidth))){const spec=ANIMATIONS[p.animation];ctx.drawImage(source,p.frame*FRAME_W,(spec.row+DIRS.indexOf(p.facing))*FRAME_H,FRAME_W,FRAME_H,v.x-FOOT_X,v.y-FOOT_Y-p.height,FRAME_W,FRAME_H);}
 if(window.MM?.baselineDraw?.labels!==false){ctx.fillStyle='#f4e6ad';ctx.font='bold 7px monospace';ctx.textAlign='center';ctx.fillText('P'+p.id,v.x,v.y-46-p.height);ctx.textAlign='start';} // MM seam: label gate
}
function drawLoot(item){if(window.MM?.art){const a=worldToCanvas(item.x,item.y);if(mmArt('loot_'+item.type,a.x,a.y,{t:game.elapsed}))return;} /* MM seam S5 */const p=worldToCanvas(item.x,item.y),color=item.type==='gold'?'#eac979':item.type==='rune'?'#9cdde4':'#e0aee5';ellipse(p.x,p.y,5,2,'rgba(52,69,48,.15)');diamond(ctx,p.x,p.y-4,7,7,color);sparkle(p.x,p.y-7,'#fff5c9',2);}
function drawFamiliar(){
 if(world.familiar==='none')return;
 const p=worldToCanvas(familiarSprite.x,familiarSprite.y);ellipse(p.x,p.y,6,2,'rgba(52,69,48,.2)');
 const kind=world.familiar==='golem'?'little_golem':world.familiar;
 drawCastSprite(kind,p,familiarSprite);
}
function drawVillageKeeper(){
 const p=worldToCanvas(6.1,10.4);ellipse(p.x,p.y,7,2,'rgba(52,69,48,.2)');
 if(world.requests>=1){fill('#906f50',p.x-17,p.y-9,11,7);fill('#d4b385',p.x-18,p.y-10,13,2);fill('#e6c77f',p.x-15,p.y-13,3,3);}
 if(world.requests>=2){fill('#745d4b',p.x-20,p.y-29,2,20);fill('#c47d6b',p.x-19,p.y-29,7,6);}
 drawCastSprite('keeper',p);
}

function drawWeatherAndLight(){
 if(isNight()){ctx.fillStyle='rgba(32,45,80,.26)';ctx.fillRect(0,0,SCREEN_W,SCREEN_H);}
 if(world.weather==='Rain'&&world.mode==='outside'){ctx.fillStyle='rgba(218,239,238,.65)';for(let i=0;i<35;i++){const x=(i*83+Math.floor(game.elapsed*13))%SCREEN_W,y=(i*47+Math.floor(game.elapsed*45))%SCREEN_H;fill('rgba(218,239,238,.65)',x,y,1,4);}}
}
function drawExtraMagic(){
 for(const b of bursts){const p=worldToCanvas(b.x,b.y),q=1-b.life/b.ttl,r=5+q*23,alpha=Math.max(0,b.life/b.ttl);
  ctx.globalAlpha=alpha*.22;ellipse(p.x,p.y-18,r*.7,r*.45,b.color);
  ctx.globalAlpha=alpha*.9;magicRing(p.x,p.y-18,r,r*.55,b.color);magicRing(p.x,p.y-18,r*.7,r*.38,b.core);
  for(let i=0;i<8;i++){const a=i*Math.PI/4+q*.6;sparkle(p.x+Math.cos(a)*r,p.y-18+Math.sin(a)*r*.55,i%2?b.color:b.core,2);}}
 for(const part of particles){const p=worldToCanvas(part.x,part.y),x=p.x+part.ox,y=p.y+part.oy;ctx.globalAlpha=Math.max(0,part.life/part.ttl);
  fill(part.color,x,y,part.size,part.size);if(part.size>=3){fill(part.color,x-part.vx*.025,y-part.vy*.025,2,2);fill('#fff6dc',x+1,y+1,1,1);}}
 ctx.globalAlpha=1;
}
function saveWorld(silent=false){
 try{const saved={...world,coop:false,targetId:null};localStorage.setItem('moss-moon-adventure-v1',JSON.stringify(saved));if(!silent)message('Adventure saved on this device');return true;}
 catch(_error){if(!silent)message('Could not save in this browser');return false;}
}
function loadWorld(){
 try{const value=JSON.parse(localStorage.getItem('moss-moon-adventure-v1')||'null');if(!value||typeof value!=='object')return;
  const base=newWorld();world={...base,...value,seeds:{...base.seeds,...value.seeds},harvest:{...base.harvest,...value.harvest},coop:false,targetId:null};
  if(!WIZARDS.some(c=>c.id===world.cls))world.cls='grove';if(!REGIONS[world.region])world.region='grove';if(!SEED_TYPES[world.seed])world.seed='wheat';if(!FAMILIARS[world.familiar])world.familiar='cat';
  if(!Array.isArray(world.plots)||world.plots.length!==6)world.plots=defaultPlots();
  if(!Array.isArray(world.gear))world.gear=[];if(!Array.isArray(world.wards))world.wards=[];
  if(!Number.isFinite(world.hp))world.hp=100;if(!Number.isFinite(world.mana))world.mana=100;
 }catch(_error){world=newWorld();}
}
let gearSignature='';
function refreshAdventureUI(){
 gameUI('worldHud').textContent=`${season()} · Day ${world.day} · ${isNight()?'Night':'Day'} · ${world.weather}${world.day%3===0&&!isNight()?' · Festival':''}     HP ${Math.ceil(world.hp)}/${heroMaxHP()}${world.ward?' · Ward '+Math.ceil(world.ward):''}  ✦ Mana ${Math.ceil(world.mana)}/100     Lv ${world.level} · ${Math.floor(world.gold)} gold`+(world.coop?' · '+party.map(p=>'P'+p.id+' '+Math.ceil(p.hp)+' HP'+(world.lootMode==='individual'?' / '+p.gold+'g':'')).join(' · '):'');
 gameUI('areaLabel').textContent=world.mode==='outside'?REGIONS[world.region].name:(world.mode==='rift'?'Rift · '+world.modifier:'Dungeon')+' · Floor '+world.floor;
 gameUI('areaSub').textContent=world.mode==='outside'?'Farm · explore · practice magic':enemies.length+' enemies remaining';
 gameUI('classDesc').textContent=currentWizard().desc;
 gameUI('farmInfo').textContent=`Seeds: ${world.seeds[world.seed]} ${SEED_TYPES[world.seed].name} · Wheat ${world.harvest.wheat} · Peppers ${world.harvest.ember} · Berries ${world.harvest.frost} · Flowers ${world.harvest.moon} · Potions ${world.potions} · Bombs ${world.bombs} · Wards ${world.wards.length}/3`;
 gameUI('adventureInfo').textContent=`${world.mode==='outside'?'Outdoors':world.mode+' · floor '+world.floor} · ${enemies.length} enemies · ${world.riftUnlocked?'Rifts unlocked':'Defeat a floor 3 boss to unlock rifts'}`;
 gameUI('progressInfo').textContent=`Level ${world.level} · XP ${world.xp}/${world.level*45} · ${world.points} skill points · Runes ${world.runes}`;
 const r=ranks();for(let i=0;i<3;i++)gameUI('skill'+i).textContent=currentWizard().paths[i]+' '+r[i]+'/3';
 const signature=JSON.stringify(world.gear);if(signature!==gearSignature){const selector=gameUI('gearSelect'),old=selector.value;selector.innerHTML=world.gear.length?world.gear.map((g,i)=>`<option value="${i}">${g.name} · power ${g.power}</option>`).join(''):'<option value="-1">No equipment yet</option>';if(old&&Number(old)<world.gear.length)selector.value=old;gearSignature=signature;}
 const equipped=world.gear[world.equipped-1];gameUI('gearInfo').textContent=equipped?`Equipped: ${equipped.name} · power ${equipped.power} · sockets ${equipped.sockets}/${equipped.maxSockets}`:'Defeat enemies and collect loot to find equipment. Each skill point improves power, health, or growth/mana.';
 gameUI('questInfo').textContent=`Village request: harvest ${(world.requests+1)*2} (${world.harvested}) and defeat ${(world.requests+1)*2} enemies (${world.kills}). Reward: 45 gold.`;
 gameUI('toggleCoop').textContent=world.coop?'End local co-op':'Start local co-op';gameUI('lootMode').textContent='Loot: '+(world.lootMode==='shared'?'Shared':'Individual');gameUI('p2Cast').disabled=!world.coop;gameUI('depositP2').disabled=!world.coop||!party[0]?.gold;
 gameUI('touchActor').textContent='Control P'+touchPlayer;gameUI('touchActor').hidden=!world.coop;
 gameUI('openRift').disabled=!world.riftUnlocked;gameUI('nextFloor').disabled=world.mode==='outside'||enemies.some(e=>e.hp>0);
}
function initializeExpansion(){
 loadWorld();
 gameUI('classSelect').innerHTML=WIZARDS.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');gameUI('classSelect').value=world.cls;
 gameUI('seedSelect').innerHTML=Object.entries(SEED_TYPES).map(([id,s])=>`<option value="${id}">${s.name}</option>`).join('');gameUI('seedSelect').value=world.seed;
 gameUI('regionSelect').innerHTML=Object.entries(REGIONS).map(([id,r])=>`<option value="${id}">${r.name}</option>`).join('');gameUI('regionSelect').value=world.region;
 gameUI('familiarSelect').innerHTML=Object.entries(FAMILIARS).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');gameUI('familiarSelect').value=world.familiar;
 gameUI('p2Class').innerHTML=WIZARDS.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');gameUI('p2Class').value=world.p2Class;
 gameUI('p2Spell').innerHTML=SPELLS.map(s=>`<option value="${s.id}">${s.school} · ${s.name}</option>`).join('');gameUI('p2Spell').value=world.p2Spell;
 gameUI('classSelect').addEventListener('change',e=>setClass(e.target.value));
 gameUI('seedSelect').addEventListener('change',e=>{if(SEED_TYPES[e.target.value])world.seed=e.target.value;});
 gameUI('familiarSelect').addEventListener('change',e=>{if(FAMILIARS[e.target.value])world.familiar=e.target.value;});
 gameUI('p2Class').addEventListener('change',e=>{const c=WIZARDS.find(x=>x.id===e.target.value);if(!c)return;world.p2Class=c.id;world.p2Spell=c.starter;gameUI('p2Spell').value=c.starter;if(party[0]){party[0].cls=c.id;party[0].spellIndex=SPELLS.findIndex(s=>s.id===c.starter);if(touchPlayer===2)spellSelect.value=String(party[0].spellIndex);}});
 gameUI('p2Spell').addEventListener('change',e=>{const i=SPELLS.findIndex(s=>s.id===e.target.value);if(i<0)return;world.p2Spell=SPELLS[i].id;if(party[0]){party[0].spellIndex=i;if(touchPlayer===2)spellSelect.value=String(i);}});
 const actions={farmAction:()=>tendPlot(),buildWard:buildFarmWard,empowerWard,restTime:()=>{world.time+=.25;message('Time passes');},brewPotion:brew,usePotion:drink,brewBomb,throwBomb,sellCrops:sellHarvest,
  travelRegion:()=>goRegion(gameUI('regionSelect').value),enterDungeon:()=>enterDungeon(false),nextFloor:advanceFloor,exitDungeon:()=>goRegion('grove'),openRift:()=>enterDungeon(true),
  skill0:()=>upgradeSkill(0),skill1:()=>upgradeSkill(1),skill2:()=>upgradeSkill(2),equipGear:equipSelected,socketRune,collectLoot:collectNearby,
  finishQuest:turnInQuest,buySeed:buySeeds,buyRune,upgradeBroom,discoverStar,toggleCoop:toggleLocalCoop,lootMode:()=>{world.lootMode=world.lootMode==='shared'?'individual':'shared';},
  p2Cast:()=>{if(party[0])castSpell(party[0]);},depositP2:()=>{if(party[0]?.gold){world.gold+=party[0].gold;message('Player 2 deposited '+party[0].gold+' gold');party[0].gold=0;}},touchActor:()=>{if(world.coop){touchPlayer=touchPlayer===1?2:1;spellSelect.value=String(touchPlayer===2&&party[0]?party[0].spellIndex:spellIndex);}},saveGame:()=>saveWorld(false)};
 for(const [id,fn] of Object.entries(actions))gameUI(id).addEventListener('click',e=>{
  fn();if(e?.detail>0&&typeof canvas.focus==='function')canvas.focus({preventScroll:true});
  if(e?.detail>0&&['travelRegion','enterDungeon','nextFloor','exitDungeon','openRift'].includes(id)&&typeof canvas.scrollIntoView==='function')canvas.scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 if(world.mode==='outside'&&world.region!=='grove')spawnGroup(REGIONS[world.region].mob,3);
 else if(world.mode!=='outside'){buildDungeonLayout();spawnGroup(REGIONS[world.region].mob,Math.min(7,3+world.floor),world.floor%3===0);}
 const starter=SPELLS.findIndex(s=>s.id===currentWizard().starter);if(starter>=0)chooseSpell(starter);
 drawGround();refreshAdventureUI();
}

function message(text){combatMessage=text;combatMessageTime=1.5;mmEmit('message',{text});} // MM seam S1/S4
function chooseSpell(index){
  if(!Number.isInteger(index)||index<0||index>=SPELLS.length)return;
  spellIndex=index;spellSelect.value=String(index);message(SPELLS[index].name+' selected');
}
function resetTraining(){
  dummy.hp=dummy.maxHP;dummy.status={};dummy.flash=0;dummy.resetIn=0;
  effects.length=0;numbers.length=0;castCooldown=0;message('Training dummy restored');
}
function castSpell(actor=game){
  if(actor===game&&game.transition){message('Finish mounting or landing first');return false;}
  if(actor===game?castCooldown>0:actor.cooldown>0)return false;
  const spell=SPELLS[actor===game?spellIndex:(actor.spellIndex??spellIndex)];
  const cost=spell.summon?18:(spell.blessing||spell.rewind||spell.cloak)?15:Math.min(17,6+Math.floor(spell.damage/16));
  const pool=actor===game?world:actor;if(!Number.isFinite(pool.mana))pool.mana=100; // MM seam: companions spend their own mana (audit §9 #3)
  if(pool.mana<cost){message('Not enough mana yet');return false;}
  const target=spell.summon||spell.blessing||spell.rewind||spell.cloak?actor:spellTarget(actor);
  if(!target){message(dummy.resetIn>0&&world.region==='grove'?'Dummy is resetting':'Move closer to an enemy or the practice dummy');return false;}
  const from=project(actor.x,actor.y),to=project(target.x,target.y);
  if(Math.hypot(to.x-from.x,to.y-from.y)>220){message('Move closer to the target');return false;}
  pool.mana-=cost;actor.castRemaining=.48;
  if(target!==actor){actor.castFacing=facingFromAngle(Math.atan2(to.y-from.y,to.x-from.x));actor.facing=actor.castFacing;}
  if(actor===game){game.target=null;castCooldown=.32;}else actor.cooldown=.32;
  if(effects.length>=32)effects.shift();
  effects.push({spell,elapsed:0,from:{x:actor.x,y:actor.y,height:actor.height||0},target,caster:actor,hitIndex:0});
  addParticles(actor,spell.color,spell.core,10,.6);
  mmEmit('cast',{actor,spell,target}); // MM seam S4
  message(spell.name+'!');return true;
}
function hitDummy(amount,color,label=''){
  if(dummy.hp<=0)return;
  const bonus=dummy.status.vulnerable?1.25:1;
  const hit=Math.max(1,Math.round(amount*bonus));
  dummy.hp=Math.max(0,dummy.hp-hit);dummy.flash=.18;
  numbers.push({value:label||String(hit),color,life:.9,offset:(numbers.length%3-1)*5});
  if(numbers.length>20)numbers.shift();
  if(dummy.hp===0){dummy.resetIn=2;dummy.status={};message('Dummy defeated — resetting');}
}
function addStatus(name){
  if(dummy.hp<=0||!name)return;
  const options={burn:{time:2.4,tick:.6,period:.6,damage:3,color:'#f69655'},
    poison:{time:3,tick:.75,period:.75,damage:4,color:'#a2cf71'},
    chill:{time:2.5},shock:{time:1.7},root:{time:2.5},vulnerable:{time:4},wet:{time:3.5}};
  if(options[name])dummy.status[name]={...options[name]};
}
function updateCombat(dt){
  castCooldown=Math.max(0,castCooldown-dt);game.castRemaining=Math.max(0,game.castRemaining-dt);
  dummy.flash=Math.max(0,dummy.flash-dt);
  combatMessageTime=Math.max(0,combatMessageTime-dt);
  if(dummy.resetIn>0){dummy.resetIn-=dt;if(dummy.resetIn<=0)resetTraining();}
  for(const [name,status] of Object.entries(dummy.status)){
    status.time-=dt;
    if(status.damage){
      status.tick-=dt;
      if(status.tick<=0&&status.time>=-dt&&dummy.hp>0){hitDummy(status.damage,status.color);status.tick+=status.period;}
    }
    if(status.time<=0)delete dummy.status[name];
  }
  for(let i=effects.length-1;i>=0;i--){
    const fx=effects[i],s=fx.spell;fx.elapsed+=dt;
    while(fx.hitIndex<s.hit.length&&fx.elapsed>=s.hit[fx.hitIndex]){
      if(s.summon)spawnAlly(s.summon,fx.caster);
      else if(s.blessing){world.ward=Math.min(60,(world.ward||0)+30);world.hp=Math.min(heroMaxHP(),world.hp+18);for(const p of party)if(screenDistance(p,fx.caster)<80)p.hp=Math.min(p.maxHP,p.hp+18);message('Ancestral blessing: health +18, ward +30');}
      else if(s.rewind){const actor=fx.caster,prior=actor===game?world.lastDamage:actor.lastDamage;const restore=Math.max(10,Math.min(35,prior||0));if(actor===game){const old=world.hp;world.hp=Math.min(heroMaxHP(),world.hp+restore);world.lastDamage=0;message('Time rewound: health +'+Math.round(world.hp-old));}else{actor.hp=Math.min(actor.maxHP,actor.hp+restore);actor.lastDamage=0;message('Player '+actor.id+' rewinds damage');}}
      else if(s.cloak){world.cloak=7;message('Shadow veil hides you for 7 seconds');}
      else{
        const target=fx.target||dummy,damage=s.damage/s.hit.length*spellMultiplier(s,fx.caster,target);
        hitEntity(target,damage,s.color,fx.caster);
        if(fx.hitIndex===0&&s.status){if(target===dummy)addStatus(s.status);else applyStatusTo(target,s.status);}
        if(fx.hitIndex===0&&s.id==='tide'){if(target===dummy)addStatus('wet');else applyStatusTo(target,'wet');}
        if(fx.hitIndex===0&&s.school==='Frost'&&target.status?.wet){if(target===dummy)addStatus('root');else applyStatusTo(target,'root');message('Frozen! Water + frost');}
        if(fx.hitIndex===0&&s.school==='Fire'&&target.status?.root){if(target===dummy)addStatus('burn');else applyStatusTo(target,'burn');message('Burning vines!');}
        if(s.heal)world.hp=Math.min(heroMaxHP(),world.hp+s.heal);
        if(['fireball','blizzard','storm','meteor','nova','wave'].includes(s.kind))for(const other of enemies){if(other!==target&&screenDistance(other,target)<28)hitEntity(other,damage*.55,s.color,fx.caster);}
        addParticles(target,s.color,s.core,s.kind==='meteor'?28:18,1);
      }
      fx.hitIndex++;
    }
    if(fx.elapsed>=s.duration)effects.splice(i,1);
  }
  for(let i=numbers.length-1;i>=0;i--){numbers[i].life-=dt;if(numbers[i].life<=0)numbers.splice(i,1);}
}
function clearControls(){keys.clear();touchDirections.clear();document.querySelectorAll('[data-dir]').forEach(b=>b.classList.remove('pressed'));}
function toggleBroom(){
  if(game.transition)return;
  game.target=null;
  game.transition={kind:game.mounted?'land':'mount',elapsed:0,duration:0.8};
  mmEmit('mount',{kind:game.transition.kind,phase:'start'}); // MM seam S4
}
function readInput(){
  let x=(keys.has('d')||(!world.coop&&keys.has('arrowright'))?1:0)-(keys.has('a')||(!world.coop&&keys.has('arrowleft'))?1:0);
  let y=(keys.has('s')||(!world.coop&&keys.has('arrowdown'))?1:0)-(keys.has('w')||(!world.coop&&keys.has('arrowup'))?1:0);
  if(!world.coop||touchPlayer===1)for(const direction of touchDirections.values()){x+=vec[direction][0];y+=vec[direction][1];}
  if(x||y){game.target=null;return normalize(x,y);}
  if(game.target){
    const here=project(game.x,game.y),target=project(game.target.x,game.target.y);
    const dx=target.x-here.x,dy=target.y-here.y;
    const remaining=Math.hypot(dx,dy);
    if(remaining<2 && speed()<4){game.target=null;return {x:0,y:0};}
    const direction=normalize(dx,dy);
    const approach=clamp(remaining/(game.mounted?16:8),0,1);
    return {x:direction.x*approach,y:direction.y*approach};
  }
  return {x:0,y:0};
}
function update(dt){
  mmHook('preUpdate',dt); // MM seam S3
  game.elapsed+=dt;
  updateCombat(dt);
  const movingInput=readInput();
  if(game.transition){
    const t=game.transition; t.elapsed=Math.min(t.duration,t.elapsed+dt);
    const p=ease(t.elapsed/t.duration);
    game.height=RIDE_HEIGHT*(t.kind==='mount'?p:1-p);
    if(t.elapsed>=t.duration){game.mounted=t.kind==='mount';game.transition=null;game.height=game.mounted?RIDE_HEIGHT:0;mmEmit('mount',{kind:t.kind,phase:'end',mounted:game.mounted});} // MM seam S4
  }
  const transition=game.transition;
  const top=game.mounted?FLY_SPEED*(1+world.broom*.15):WALK_SPEED;
  const targetVX=transition?0:movingInput.x*top, targetVY=transition?0:movingInput.y*top;
  const accelerating=Math.hypot(targetVX,targetVY)>1;
  const rate=transition?8:accelerating?(game.mounted?4.6:7.5):(game.mounted?5.5:9.0);
  const k=1-Math.exp(-rate*dt);
  game.vx+=(targetVX-game.vx)*k; game.vy+=(targetVY-game.vy)*k;
  if(Math.hypot(game.vx,game.vy)<0.08&&!accelerating){game.vx=0;game.vy=0;}
  const old=project(game.x,game.y);
  const move=unproject(game.vx*dt,game.vy*dt);
  moveActor(game,move.x,move.y);
  const now=project(game.x,game.y),dist=Math.hypot(now.x-old.x,now.y-old.y);
  if(dt>0 && dist+0.001<Math.hypot(game.vx*dt,game.vy*dt)){
    game.vx=(now.x-old.x)/dt;game.vy=(now.y-old.y)/dt;
  }
  if(!game.mounted && !transition)game.walkDistance+=dist;
  if(speed()>1.2){
    const desired=Math.atan2(game.vy,game.vx),diff=angleDiff(desired,game.heading);
    const turn=clamp(diff,-dt*(game.mounted?6.2:10),dt*(game.mounted?6.2:10));
    game.heading+=turn;game.facing=facingFromAngle(game.heading);
    if(game.mounted && Math.abs(diff)>.17){game.bank=Math.sign(diff);game.bankTimer=.18;}
  }
  game.bankTimer=Math.max(0,game.bankTimer-dt);
  if(!game.bankTimer)game.bank=0;
  if(transition){
    game.state=transition.kind==='mount'?'Mounting':'Landing';game.animation='mount';
    const f=clamp(Math.floor(transition.elapsed*1000/100),0,7);
    game.frame=transition.kind==='mount'?f:7-f;
  }else if(game.mounted){
    game.state=speed()>3?'Flying':'Hovering';
    game.animation=game.state==='Hovering'?'hover':(game.bank<0?'bank_left':game.bank>0?'bank_right':'fly');
    game.frame=Math.floor(game.elapsed*1000/100)%8;
  }else if(speed()>1.1){
    game.state='Walking';game.animation='walk';game.frame=Math.floor(game.walkDistance/ANIMATIONS.walk.distancePerFrame)%8;
  }else{game.state='Standing';game.animation='idle';game.frame=Math.floor(game.elapsed*1000/125)%8;}
  if(game.castRemaining>0&&!transition){
    game.facing=game.castFacing;
    if(!game.mounted&&speed()<3){game.animation='cast';game.frame=clamp(Math.floor((.48-game.castRemaining)/.06),0,7);}
  }
  // MM seam S6: follow rate, velocity look-ahead and focus target from MM.camera (baseline: rate 4, no lead).
  const cam=window.MM?.camera,focusAt=cam?.focusPoint?.(dt),lead=focusAt?0:(cam?.lookAhead??0);
  const camFactor=1-Math.exp(-dt*(cam?.follow??4.0)),camTX=focusAt?focusAt.x:now.x+game.vx*lead,camTY=focusAt?focusAt.y:now.y+game.vy*lead;
  game.camX+=(camTX-game.camX)*camFactor;game.camY+=(camTY-game.camY)*camFactor;
  updateWorld(dt);mmHook('postUpdate',dt);uiClock+=dt; // MM seam S3
  return dist;
}

// Cached 2:1 isometric ground. Every diamond is 32×16 logical pixels.
const ground=document.createElement('canvas');ground.width=MAP_SIZE*TILE_W+100;ground.height=MAP_SIZE*TILE_H+100;
const gc=ground.getContext('2d');gc.imageSmoothingEnabled=false;
const GX=ground.width/2,GY=22;
function diamond(c,x,y,w,h,color){c.fillStyle=color;c.beginPath();c.moveTo(x,y-h/2);c.lineTo(x+w/2,y);c.lineTo(x,y+h/2);c.lineTo(x-w/2,y);c.closePath();c.fill();}
function hash(a,b,n=0){let x=((a+13)*73856093)^((b+31)*19349663)^(n*83492791);x=(x^(x>>>13))*1274126177;return (x>>>0)/4294967296;}
function drawGround(){
  gc.clearRect(0,0,ground.width,ground.height);
  const a=project(0,0),b=project(MAP_SIZE,0),c=project(MAP_SIZE,MAP_SIZE),d=project(0,MAP_SIZE);
  gc.fillStyle='#5f7658';gc.beginPath();gc.moveTo(GX+a.x,GY+a.y+7);gc.lineTo(GX+b.x,GY+b.y+7);gc.lineTo(GX+c.x,GY+c.y+7);gc.lineTo(GX+d.x,GY+d.y+7);gc.closePath();gc.fill();
  for(let x=0;x<MAP_SIZE;x++)for(let y=0;y<MAP_SIZE;y++){
    const p=project(x+.5,y+.5),px=GX+p.x,py=GY+p.y;
    const plaza=(x>=7&&x<=12&&y>=7&&y<=12);
    const path=(x>=9&&x<=10)||(y>=9&&y<=10);
    const pond=world.mode==='outside'&&x>=15&&y<=4 && !(x===15&&y===4);
    const r=hash(x,y,world.mode==='outside'?0:(world.dungeonSeed||1)+world.floor*37);
    const grass=world.mode==='outside'?['#9fbf8d','#a6c593','#a0c090','#9cbb89','#aac696']:['#858982','#8c8d84','#7f857e','#90918a','#858981'];
    const stone=world.mode==='outside'?['#d8d8ba','#d1d3b4','#dddcc2','#d4d7b8','#cbcdae']:['#9f9e91','#a7a79b','#aaa99d','#96988c','#a0a194'];
    diamond(gc,px,py,TILE_W,TILE_H,pond?['#8abdb0','#94c8b7','#84b7aa'][Math.floor(r*3)]:(plaza||path)?stone[Math.floor(r*5)]:grass[Math.floor(r*5)]);
    if(plaza||path){
      gc.fillStyle='#b6bfa6';gc.fillRect(px-1,py+5,2,1);
      if(r>.61){gc.fillStyle='#eef0d6';gc.fillRect(px-7,py-2,4,1);}
      if(r<.23){gc.fillStyle='#c2c9ad';gc.fillRect(px+3,py+1,3,1);}
    }else if(pond){
      if(r>.48){gc.fillStyle='#c7e0c5';gc.fillRect(px-4,py-1,6,1);}
      if(r>.8){gc.fillStyle='#5f9b7e';gc.fillRect(px+2,py+2,4,2);gc.fillStyle='#e8e6c9';gc.fillRect(px+4,py+1,1,1);}
    }else{
      if(r>.28){gc.fillStyle='#82a977';gc.fillRect(px-4,py+1,1,2);gc.fillRect(px-2,py,1,2);}
      if(r>.76){gc.fillStyle=['#f3e2b0','#eabcb4','#f0edc8'][Math.floor(hash(x,y,7)*3)];gc.fillRect(px+5,py,2,2);gc.fillRect(px+3,py+1,1,1);}
      if(r<.16){gc.fillStyle='#b5d0a0';gc.fillRect(px-8,py-1,3,1);}
    }
  }
  const tint=world.mode==='outside'?REGIONS[world.region].tint:'rgba(45,39,58,.25)';
  if(tint){gc.globalCompositeOperation='source-atop';gc.fillStyle=tint;gc.fillRect(0,0,ground.width,ground.height);gc.globalCompositeOperation='source-over';}
}
drawGround();

const props=[
 {x:2.4,y:3.2,type:'tree',variant:0},{x:3.0,y:7.0,type:'tree',variant:1},
 {x:2.6,y:15.0,type:'tree',variant:0},{x:5.0,y:17.0,type:'tree',variant:1},
 {x:16.2,y:6.0,type:'tree',variant:1},{x:17.0,y:13.8,type:'tree',variant:0},
 {x:13.8,y:17.3,type:'tree',variant:1},{x:6.5,y:5.4,type:'lamp'},
 {x:13.2,y:6.3,type:'lamp'},{x:6.1,y:13.8,type:'lamp'},
 {x:13.9,y:13.5,type:'lamp'},{x:6.0,y:10.7,type:'bench'},
 {x:14.4,y:9.0,type:'flowers'},{x:5.7,y:8.0,type:'flowers'},
 {x:11.9,y:15.5,type:'flowers'},{x:5.0,y:3.8,type:'rock'}
];
function fill(c,x,y,w,h){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function tree(x,y,v){
  ellipse(x,y,16,4,'rgba(49,74,55,.22)');
  fill('#5e5642',x-3,y-21,7,20);fill('#8a7656',x-1,y-20,3,17);fill('#b0966c',x,y-17,1,10);
  ctx.fillStyle='#456a53';ctx.beginPath();ctx.moveTo(x-18,y-24);ctx.lineTo(x-16,y-34);ctx.lineTo(x-11,y-38);ctx.lineTo(x-9,y-46);ctx.lineTo(x-1,y-49);ctx.lineTo(x+5,y-47);ctx.lineTo(x+10,y-42);ctx.lineTo(x+17,y-40);ctx.lineTo(x+20,y-32);ctx.lineTo(x+17,y-23);ctx.lineTo(x+9,y-19);ctx.lineTo(x-10,y-19);ctx.closePath();ctx.fill();
  fill('#688d65',x-15,y-34,8,8);fill('#719b70',x-10,y-42,12,10);fill('#7ca77a',x-4,y-46,8,8);
  fill('#5e865f',x+3,y-41,10,12);fill('#547b59',x+10,y-35,7,8);fill('#789d6c',x-14,y-28,8,5);
  fill('#87ad7b',x-7,y-41,4,2);fill('#92b681',x-2,y-44,3,2);fill('#8db27f',x+5,y-35,4,2);
  fill('#4b7052',x-4,y-24,6,3);fill('#4e7252',x+7,y-27,6,3);
  if(v){fill('#ddb0a0',x-10,y-35,2,2);fill('#e7c0ae',x+8,y-31,2,2);fill('#e5b9a8',x,y-39,2,2);}
}
function lamp(x,y){ellipse(x,y,7,2,'rgba(49,74,55,.22)');fill('#546957',x-2,y-18,4,17);fill('#738374',x-1,y-17,1,15);fill('#4e6355',x-4,y-25,8,8);fill('#efe0a8',x-3,y-24,6,6);fill('#f8efc7',x-2,y-23,2,4);fill('#55685a',x-5,y-26,10,2);fill('#5a6e5c',x-2,y-28,4,2);}
function flowers(x,y){ellipse(x,y,10,3,'rgba(63,91,58,.15)');for(let i=0;i<6;i++){const dx=[-7,-3,0,4,7,2][i],dy=[-3,-5,-2,-5,-2,-7][i];fill('#729a69',x+dx,y+dy,1,5);fill(i%2?'#efcec1':'#f1e6bb',x+dx-1,y+dy,3,2);}}
function bench(x,y){ellipse(x,y,13,3,'rgba(49,74,55,.2)');fill('#685b4b',x-9,y-8,2,8);fill('#685b4b',x+7,y-6,2,6);fill('#856e53',x-11,y-11,22,4);fill('#c2a27b',x-10,y-10,20,1);fill('#9b805e',x-11,y-6,22,3);fill('#c9aa80',x-10,y-6,20,1);}
function drawProp(p,x,y){
  // MM seam S5: custom draw fn, explicit p.art sprite, or 'prop_<type>_<variant>' / 'prop_<type>' from MM.art (anchor = foot).
  if(typeof p.draw==='function'){p.draw(ctx,{x,y},p);return;}
  if(window.MM?.art&&(mmArt(p.art,x,y,p.artOpts)||mmArt('prop_'+p.type+'_'+(p.variant??0),x,y)||mmArt('prop_'+p.type,x,y)))return;
  if(p.type==='tree')tree(x,y,p.variant);else if(p.type==='lamp')lamp(x,y);else if(p.type==='bench')bench(x,y);else if(p.type==='flowers')flowers(x,y);else{ellipse(x,y,10,3,'rgba(49,74,55,.12)');fill('#b2beaa',x-6,y-5,12,4);fill('#d5ddc5',x-4,y-7,8,3);}}
function worldToCanvas(x,y){const p=project(x,y);return {x:Math.round(SCREEN_W/2+p.x-game.camX),y:Math.round(SCREEN_H/2+p.y-game.camY)};}
function drawDummy(pos){
  const x=pos.x+(dummy.flash>0?(Math.floor(game.elapsed*32)%2?1:-1):0),y=pos.y;
  ellipse(x,y,10,3,'rgba(51,65,44,.25)');
  ctx.save();if(dummy.flash>0)ctx.filter='brightness(1.35)';drawCastSprite('dummy',{x,y});ctx.restore();
  fill('#385046',x-15,y-47,30,4);fill('#d9e6cc',x-14,y-46,28,2);
  fill('#9cba80',x-14,y-46,Math.round(28*dummy.hp/dummy.maxHP),2);
  if(window.MM?.baselineDraw?.labels!==false){ctx.fillStyle='#516d58';ctx.font='bold 6px monospace';ctx.textAlign='center';ctx.fillText(dummy.hp?'DUMMY':'RESETTING',x,y-50);ctx.textAlign='start';} // MM seam: label gate
  if(dummy.status.root){fill('#70a966',x-10,y-5,3,4);fill('#8cc776',x+7,y-7,3,5);}
  if(dummy.status.vulnerable){fill('#b296df',x-10,y-29,2,2);fill('#e0ccf3',x+8,y-24,2,2);}
}
function pixelLine(x1,y1,x2,y2,color,size=2){
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(x2-x1),Math.abs(y2-y1))/2));
  for(let i=0;i<=steps;i++){const p=i/steps;fill(color,x1+(x2-x1)*p-size/2,y1+(y2-y1)*p-size/2,size,size);}
}
function sparkle(x,y,color,size=2){fill(color,x-size,y,2*size+1,1);fill(color,x,y-size,1,2*size+1);}
function magicRing(x,y,rx,ry,color){ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);ctx.stroke();}
function impact(x,y,t,spell){
  const q=clamp(t,0,1),r=3+q*16;
  magicRing(x,y,r,r*.55,spell.color);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;fill(i%2?spell.color:spell.core,x+Math.cos(a)*r,y+Math.sin(a)*r*.65,2,2);
  }
}
function drawEffect(fx){
  const s=fx.spell,t=fx.elapsed,hit=s.hit[0],p=clamp(t/s.duration,0,1);
  const victim=fx.target||dummy;
  const start=worldToCanvas(fx.from.x,fx.from.y),target=worldToCanvas(victim.x,victim.y);
  const dir=normalize(target.x-start.x,target.y-start.y);
  const x1=start.x+dir.x*8,y1=start.y-20-fx.from.height+dir.y*4;
  const x2=target.x,y2=target.y-21;
  const progress=clamp(t/Math.max(.01,hit),0,1);
  const px=x1+(x2-x1)*progress,py=y1+(y2-y1)*progress;
  if(s.kind==='summon'){
    const r=7+p*18;magicRing(start.x,start.y,r,r*.45,s.color);magicRing(start.x,start.y,r*.65,r*.3,s.core);
    for(let i=0;i<8;i++){const a=i*Math.PI/4+t*4;sparkle(start.x+Math.cos(a)*r,start.y+Math.sin(a)*r*.45,s.core,1);}return;
  }
  const projectile=['bolt','shard','missile','seed','star','fireball','orb'].includes(s.kind);
  if(projectile){
    if(t<hit){
      for(let i=4;i>=1;i--){const q=clamp(progress-i*.075,0,1);fill(i%2?s.color:s.core,x1+(x2-x1)*q,y1+(y2-y1)*q,2,2);}
      const size=s.kind==='fireball'?5:s.kind==='orb'?4:3;
      if(s.kind==='shard'||s.kind==='seed'){diamond(ctx,px,py,size*2,size*2,s.color);fill(s.core,px-1,py-2,2,3);}
      else if(s.kind==='star'){sparkle(px,py,s.color,4);fill(s.core,px-1,py-1,3,3);}
      else{fill(s.color,px-size/2,py-size/2,size,size);fill(s.core,px-1,py-1,2,2);}
    }else impact(x2,y2,(t-hit)/(s.duration-hit),s);
    return;
  }
  if(s.kind==='lightning'){
    let lastX=x1,lastY=y1;
    for(let i=1;i<=7;i++){const q=i/7,j=(i===7?0:((i*17+Math.floor(t*18)*7)%7-3));
      const nx=x1+(x2-x1)*q+j,ny=y1+(y2-y1)*q-j;
      pixelLine(lastX,lastY,nx,ny,s.color,3);pixelLine(lastX,lastY,nx,ny,s.core,1);lastX=nx;lastY=ny;}
    sparkle(x2,y2,s.core,4);return;
  }
  if(s.kind==='beam'){
    pixelLine(x1,y1,x2,y2,s.color,4);pixelLine(x1,y1,x2,y2,s.core,2);
    sparkle(x2,y2,s.core,4+Math.round(Math.sin(t*20)));return;
  }
  if(s.kind==='meteor'){
    if(t<hit){const my=y2-90*(1-progress),mx=x2-28*(1-progress);
      pixelLine(mx-12,my-22,mx,my,s.color,3);fill('#775247',mx-5,my-5,10,10);fill(s.color,mx-4,my-3,8,7);fill(s.core,mx-2,my-1,3,3);}
    else impact(x2,y2,(t-hit)/(s.duration-hit),s);return;
  }
  if(s.kind==='blizzard'){
    magicRing(x2,y2+12,14+4*Math.sin(t*5),6,s.color);
    for(let i=0;i<12;i++){const a=i*2.4+t*3,rx=5+(i%4)*4,yy=((i*17+t*28)%45)-31;
      sparkle(x2+Math.cos(a)*rx,y2+yy,i%2?s.color:s.core,1);}return;
  }
  if(s.kind==='storm'){
    fill('#777b91',x2-15,y2-47,30,7);fill('#9293a4',x2-10,y2-50,20,5);
    if(Math.sin(t*19)>.15){pixelLine(x2+5,y2-42,x2-3,y2-23,s.core,2);pixelLine(x2-3,y2-23,x2+4,y2-21,s.core,2);pixelLine(x2+4,y2-21,x2-4,y2+3,s.core,2);}
    for(let i=0;i<7;i++)fill('#b4c7d8',x2-13+i*4,y2-38+((i*7+t*38)%30),1,3);return;
  }
  if(s.kind==='vines'){
    for(let k=-1;k<=1;k++){let lx=x2+k*7,ly=y2+19;for(let j=1;j<=7;j++){
      const nx=x2+k*7+Math.sin(j*.8+t*5+k)*3,ny=y2+19-j*5*Math.min(1,t*4);
      pixelLine(lx,ly,nx,ny,s.color,2);if(j%2===0)fill(s.core,nx+(j%4?2:-3),ny,3,2);lx=nx;ly=ny;}}
    return;
  }
  if(s.kind==='spikes'){
    const growth=Math.min(1,t*4);
    for(let i=-2;i<=2;i++){const x=x2+i*5,h=(12+(i%2)*5)*growth;
      ctx.fillStyle=i%2?s.color:s.core;ctx.beginPath();ctx.moveTo(x-3,y2+20);ctx.lineTo(x,y2+20-h);ctx.lineTo(x+3,y2+20);ctx.closePath();ctx.fill();}return;
  }
  if(s.kind==='wave'){
    const x=x1+(x2-x1)*progress,y=y1+(y2-y1)*progress;
    for(let i=0;i<3;i++){ctx.strokeStyle=i===1?s.core:s.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x-i*5,y,5+i*3,-1.35,1.35);ctx.stroke();}
    if(t>=hit)impact(x2,y2,(t-hit)/(s.duration-hit),s);return;
  }
  if(s.kind==='wind'){
    for(let i=0;i<3;i++){ctx.strokeStyle=i%2?s.color:s.core;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x2,y2,7+i*4,t*7+i, t*7+i+2.5);ctx.stroke();}return;
  }
  if(s.kind==='well'){
    ellipse(x2,y2+15,14,5,'rgba(59,38,86,.6)');
    for(let i=0;i<13;i++){const a=t*6+i*.8,r=3+(i%5)*3;fill(i%3?s.color:s.core,x2+Math.cos(a)*r,y2+15+Math.sin(a)*r*.35,2,2);}
    return;
  }
  if(s.kind==='swarm'){
    for(let i=0;i<3;i++){const q=clamp((t-i*.18)/.55,0,1),x=x1+(x2-x1)*q,y=y1+(y2-y1)*q+Math.sin(q*8+i)*5;
      sparkle(x,y,i%2?s.color:s.core,2);}
    if(t>.8)impact(x2,y2,(t-.8)/.45,s);return;
  }
  if(s.kind==='nova'){
    const r=4+20*Math.sin(Math.min(1,p)*Math.PI/2);magicRing(x2,y2,r,r*.55,s.color);
    for(let i=0;i<10;i++){const a=i*Math.PI/5;pixelLine(x2+Math.cos(a)*r*.6,y2+Math.sin(a)*r*.35,x2+Math.cos(a)*r,y2+Math.sin(a)*r*.6,i%2?s.core:s.color,2);}return;
  }
}
function drawCharacter(pos){
  const airborne=game.height>0.05;
  const bob=(!game.transition&&game.mounted)?BOB[game.frame]:0;
  const visualHeight=Math.max(0,game.height-bob);
  const shadowScale=1-clamp(visualHeight/38,0,.45);
  ellipse(pos.x,pos.y,10*shadowScale,3*shadowScale,`rgba(42,57,46,${(.28-visualHeight*.006).toFixed(3)})`);
  const source=recoloredAtlas||atlasImages[chosenLook.style];
  if(!source || (!recoloredAtlas && (!source.complete || !source.naturalWidth)))return;
  const spec=ANIMATIONS[game.animation],dir=DIRS.indexOf(game.facing);
  const sy=(spec.row+dir)*FRAME_H,sx=game.frame*FRAME_W;
  ctx.drawImage(source,sx,sy,FRAME_W,FRAME_H,Math.round(pos.x-FOOT_X),Math.round(pos.y-FOOT_Y-visualHeight),FRAME_W,FRAME_H);
}
function draw(){
  ctx.clearRect(0,0,SCREEN_W,SCREEN_H);
  ctx.fillStyle='#a0bf9c';ctx.fillRect(0,0,SCREEN_W,SCREEN_H);
  // MM seam S6: integer screen-shake translate for the world layers (pointer mapping stays unshaken).
  const shake=window.MM?.camera?.offset?.()||{x:0,y:0};ctx.save();ctx.translate(Math.round(shake.x)||0,Math.round(shake.y)||0);
  mmHook('preDraw',ctx); // MM seam S3
  ctx.drawImage(ground,Math.round(SCREEN_W/2-game.camX-GX),Math.round(SCREEN_H/2-game.camY-GY));
  mmHook('drawGround',ctx); // MM seam S3: decals / blob shadows / animated ground on top of the cached ground
  const drawables=(world.mode==='outside'?props:props.filter(p=>p.type==='lamp'||p.type==='rock')).map(p=>({type:'prop',p,depth:project(p.x,p.y).y}));
  drawables.push({type:'player',depth:project(game.x,game.y).y});
  if(world.region==='grove'&&world.mode==='outside'){
    drawables.push({type:'dummy',depth:project(dummy.x,dummy.y).y},{type:'villager',depth:project(6.1,10.4).y});
    for(const p of world.plots)drawables.push({type:'plot',p,depth:project(p.x,p.y).y-.1});
    for(const p of world.wards)drawables.push({type:'ward',p,depth:project(p.x,p.y).y});
  }
  for(const p of enemies)drawables.push({type:'enemy',p,depth:project(p.x,p.y).y});
  for(const p of dungeonBlocks)drawables.push({type:'block',p,depth:project(p.x,p.y).y});
  for(const p of lootDrops)drawables.push({type:'loot',p,depth:project(p.x,p.y).y});
  for(const p of allies)drawables.push({type:'summon',p,depth:project(p.x,p.y).y});
  for(const p of party)drawables.push({type:'companion',p,depth:project(p.x,p.y).y});
  if(world.familiar!=='none')drawables.push({type:'familiar',depth:project(familiarSprite.x,familiarSprite.y).y});
  // MM seam S3: modules push {type:'custom',x,y,depth?,draw(ctx,pos)} (depth defaults to project(x,y).y).
  if(window.MM?.hooks){mmHook('drawables',drawables,project);for(const d of drawables)if(!Number.isFinite(d.depth))d.depth=Number.isFinite(d.x)?project(d.x,d.y).y:0;}
  drawables.sort((a,b)=>a.depth-b.depth);
  for(const item of drawables){
    if(item.type==='player')drawCharacter(worldToCanvas(game.x,game.y));
    else if(item.type==='dummy')drawDummy(worldToCanvas(dummy.x,dummy.y));
    else if(item.type==='plot')drawFarmPlot(item.p);
    else if(item.type==='ward')drawWard(item.p);
    else if(item.type==='enemy')drawMonster(item.p);
    else if(item.type==='block')drawDungeonBlock(item.p);
    else if(item.type==='loot')drawLoot(item.p);
    else if(item.type==='summon')drawSummon(item.p);
    else if(item.type==='companion')drawCompanion(item.p);
    else if(item.type==='familiar')drawFamiliar();
    else if(item.type==='villager')drawVillageKeeper();
    else if(item.type==='custom'){if(typeof item.draw==='function'){try{item.draw(ctx,worldToCanvas(item.x,item.y),item);}catch(e){console.error('[MM drawable]',e);}}} // MM seam S3
    else if(item.p){const p=worldToCanvas(item.p.x,item.p.y);drawProp(item.p,p.x,p.y);}
  }
  if(mmHook('light',ctx)!==true)drawWeatherAndLight(); // MM seam S3: a lighting module may replace the flat night tint
  for(const effect of effects)drawEffect(effect);
  drawExtraMagic();
  mmHook('postEffects',ctx); // MM seam S3
  ctx.textAlign='center';ctx.font='bold 8px monospace';
  if(mmSetting('damageNumbers',true)!==false&&window.MM?.baselineDraw?.damageNumbers!==false)for(const n of numbers){ // MM seam: settings gateconst dp=worldToCanvas(n.x??dummy.x,n.y??dummy.y);ctx.fillStyle='#35443b';ctx.fillText(n.value,dp.x+n.offset+1,dp.y-48-(1-n.life)*12+1);ctx.fillStyle=n.color;ctx.fillText(n.value,dp.x+n.offset,dp.y-48-(1-n.life)*12);}
  ctx.textAlign='start';
  if(game.target){const p=worldToCanvas(game.target.x,game.target.y);ctx.strokeStyle='#f7f5cc';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p.x,p.y,5,2.5,0,0,Math.PI*2);ctx.stroke();}
  ctx.restore(); // MM seam S6: end of shaken world layers
  mmHook('overlay',ctx); // MM seam S3: screen-space canvas overlay
  if(window.MM?.legacyUI!==false){ // MM seam S1: legacy sidebar DOM writes (off when MM's menus replace the sidebar)
  debug.textContent=`STATE  ${game.state}\nANIM   ${game.animation}\nFRAME  ${game.frame+1} / 8\nFACING ${game.facing}\nVEL    ${game.vx.toFixed(1)}, ${game.vy.toFixed(1)}\nHEIGHT ${game.height.toFixed(1)}`;
  modeLabel.textContent=game.state;
  modeDetail.textContent=game.state==='Standing'?'· enjoying the garden':game.state==='Walking'?'· taking the scenic route':game.state==='Hovering'?'· floating gently':game.state==='Flying'?'· catching a little breeze':'· one moment';
  const text=game.mounted?'✦  Land broom':'✦  Mount broom';
  mountBtn.textContent=text;touchMount.textContent=world.coop&&touchPlayer===2&&party[0]?(party[0].mounted?'✦  P2 land':'✦  P2 broom'):text;
  mountBtn.disabled=!!game.transition;touchMount.disabled=!!game.transition;
  const controlActor=world.coop&&touchPlayer===2&&party[0]?party[0]:game;
  const spell=SPELLS[controlActor===game?spellIndex:controlActor.spellIndex],active=Object.keys(dummy.status).map(s=>s.toUpperCase());
  const cost=spell.summon?18:(spell.blessing||spell.rewind||spell.cloak)?15:Math.min(17,6+Math.floor(spell.damage/16));
  spellDesc.textContent=(combatMessageTime>0?combatMessage+' · ':'')+(controlActor===game?'':'P2: ')+spell.description+' · '+cost+' mana';
  const foe=spellTarget(game);
  dummyStatus.textContent=foe&&foe!==dummy?`Enemy ${Math.ceil(foe.hp)} / ${foe.maxHP}`:(world.region==='grove'&&world.mode==='outside'?`Dummy ${Math.ceil(dummy.hp)} / ${dummy.maxHP}`+(active.length?' · '+active.join(', '):''):`Enemies ${enemies.length}`);
  castButton.textContent=controlActor===game?'✦ Cast':'✦ P2 cast';
  castButton.disabled=controlActor===game?(castCooldown>0||!!game.transition):controlActor.cooldown>0;
  if(uiClock>.2){uiClock=0;refreshAdventureUI();}
  } // end MM seam S1 gate
  mmHook('postDraw'); // MM seam S3
}
let previous=0;
function loop(t){
  if(!previous)previous=t;
  // Substeps keep acceleration and turn behavior stable on slower devices.
  let remaining=Math.min((t-previous)/1000,.2);previous=t;
  while(remaining>0.00001){const step=Math.min(remaining,1/60);update(step);remaining-=step;}
  draw();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey)return;
  const k=e.key.toLowerCase();
  // Form controls keep their normal keyboard behavior.
  if(e.target&&typeof e.target.closest==='function'&&e.target.closest('select,input,textarea'))return;
  if((k===' '||k==='enter')&&e.target&&typeof e.target.closest==='function'&&e.target.closest('button'))return;
  if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright','b','e','h','enter',' ','1','2','3','4','5'].includes(k)){
    e.preventDefault();
    if(k==='b'&&!e.repeat)toggleBroom();
    else if(k===' '&&!e.repeat)castSpell();
    else if(k==='e'&&!e.repeat)tendPlot();
    else if(k==='h'&&!e.repeat)drink();
    else if(k==='enter'&&!e.repeat&&world.coop&&party[0])castSpell(party[0]);
    else if('12345'.includes(k)&&!e.repeat)chooseSpell(Number(k)-1);
    else if(!['b',' ','e','h','enter'].includes(k)&&!('12345'.includes(k)))keys.add(k);
  }
});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());});
window.addEventListener('blur',clearControls);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearControls();previous=0;}});
document.querySelectorAll('[data-dir]').forEach(button=>{
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);touchDirections.set(e.pointerId,button.dataset.dir);button.classList.add('pressed');});
  const release=e=>{touchDirections.delete(e.pointerId);button.classList.remove('pressed');};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
});
canvas.addEventListener('pointerdown',e=>{
  const r=canvas.getBoundingClientRect();
  const screenX=(e.clientX-r.left)*SCREEN_W/r.width,screenY=(e.clientY-r.top)*SCREEN_H/r.height;
  for(const foe of enemies){const p=worldToCanvas(foe.x,foe.y);if(Math.abs(screenX-p.x)<18&&screenY>p.y-(CAST_HEIGHT[foe.type]||38)-(foe.boss?12:4)&&screenY<p.y+5){world.targetId=foe.id;castSpell();return;}}
  if(world.region==='grove'&&world.mode==='outside')for(const plot of world.plots){const p=worldToCanvas(plot.x,plot.y);if(Math.abs(screenX-p.x)<12&&Math.abs(screenY-p.y)<7){tendPlot(plot);return;}}
  if(world.region==='grove'&&world.mode==='outside'){const p=worldToCanvas(6.1,10.4);if(Math.abs(screenX-p.x)<12&&screenY>p.y-40&&screenY<p.y+4){turnInQuest();return;}}
  const target=worldToCanvas(dummy.x,dummy.y);
  if(world.region==='grove'&&world.mode==='outside'&&Math.abs(screenX-target.x)<18&&screenY>target.y-43&&screenY<target.y+5){world.targetId='dummy';castSpell();return;}
  const x=screenX-SCREEN_W/2+game.camX;
  const y=screenY-SCREEN_H/2+game.camY;
  const p=unproject(x,y);game.target={x:clamp(p.x,.6,MAP_SIZE-.6),y:clamp(p.y,.6,MAP_SIZE-.6)};
});
mountBtn.addEventListener('click',toggleBroom);touchMount.addEventListener('click',()=>{if(world.coop&&touchPlayer===2&&party[0])party[0].mounted=!party[0].mounted;else toggleBroom();});
spellSelect.addEventListener('change',()=>{const i=Number(spellSelect.value);if(world.coop&&touchPlayer===2&&party[0]&&SPELLS[i]){party[0].spellIndex=i;world.p2Spell=SPELLS[i].id;gameUI('p2Spell').value=world.p2Spell;}else chooseSpell(i);});
castButton.addEventListener('click',()=>castSpell(world.coop&&touchPlayer===2&&party[0]?party[0]:game));resetDummyButton.addEventListener('click',resetTraining);
document.getElementById('reset').addEventListener('click',()=>{clearControls();game=freshGame();resetTraining();const p=project(game.x,game.y);game.camX=p.x;game.camY=p.y;draw();});
toggleDebug.addEventListener('click',()=>{debug.hidden=!debug.hidden;toggleDebug.textContent=debug.hidden?'Show debug':'Hide debug';toggleDebug.setAttribute('aria-pressed',String(!debug.hidden));});
function refreshChoices(){
  document.querySelectorAll('[data-style]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.style===chosenLook.style)));
  document.querySelectorAll('[data-group][data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===chosenLook[b.dataset.group])));
}
function chooseLook(group,value){
  if(group==='style'?!Object.hasOwn(ATLAS_DATA,value):(!PALETTES[group]||!Object.hasOwn(PALETTES[group],value)))return;
  chosenLook[group]=value;recoloredAtlas=null;buildColoredAtlas();refreshChoices();
  try{localStorage.setItem('moss-moon-look',JSON.stringify(chosenLook));}catch(_error){}
}
document.querySelectorAll('[data-style]').forEach(b=>b.addEventListener('click',()=>chooseLook('style',b.dataset.style)));
document.querySelectorAll('[data-group][data-color]').forEach(b=>b.addEventListener('click',()=>chooseLook(b.dataset.group,b.dataset.color)));
refreshChoices();
initializeExpansion();
// Read-only diagnostics make automated controller and frame checks possible.
window.__witchDemo={getState:()=>({...game,transition:game.transition?{...game.transition}:null}),getLook:()=>({...chosenLook}),getDummy:()=>({hp:dummy.hp,maxHP:dummy.maxHP,status:Object.keys(dummy.status)}),getSpell:()=>SPELLS[spellIndex].name,spells:SPELLS.map(s=>s.name),getWorld:()=>({class:world.cls,region:world.region,mode:world.mode,day:world.day,level:world.level,hp:world.hp,mana:world.mana,gold:world.gold,enemies:enemies.length,cooperative:world.coop}),animations:ANIMATIONS,directions:DIRS};
