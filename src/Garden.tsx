import {useId} from 'react';
import {GardenParticles} from './GardenParticles';
import {DEFAULT_TARGET_TOLERANCE,isInTargetBand} from './session';

type GardenProps = {
  growth?:number;
  holdFraction?:number;
  level?: number;
  target?: number;
  tolerance?: number;
  showEffort?: boolean;
  showTarget?: boolean;
  showWater?: boolean;
  resting?: boolean;
  rewarded?: boolean;
  preview?: boolean;
  effects?: boolean;
  daylight?: boolean;
  confirmTarget?: boolean;
  targetPulse?: number|null;
};

const stars = [[64,83],[108,57],[156,115],[218,56],[258,114],[361,50],[422,94],[469,47],[549,66],[597,111]];
const petals = [0,45,90,135,180,225,270,315];
const sparks = [[-52,-42],[-34,-68],[5,-78],[47,-57],[66,-19],[62,31],[-65,17]];

function activityDisplayLevel(level:number){
  const activity=Math.max(0,level);
  // Leave 20% of the visual range for activity above the comfortable reference.
  return activity<=1 ? activity*.8 : 1-.2/activity;
}

export function Garden({growth=6,holdFraction=0,level=0,target=.3,tolerance=DEFAULT_TARGET_TOLERANCE,showEffort=false,showTarget=false,showWater=showEffort,resting=false,rewarded=false,preview=false,effects=false,daylight=false,confirmTarget=false,targetPulse=null}:GardenProps){
  const id=useId();
  const paint=(name:string)=>`url(#${id}-${name})`;
  const water=activityDisplayLevel(level);
  const inZone=showTarget&&isInTargetBand(level,target,tolerance);
  const flow=showWater&&!resting&&level>.025?water:0;
  const flowing=flow>0;
  const meterY=(value:number)=>252-144*activityDisplayLevel(value);
  const bandTop=meterY(target+tolerance),bandBottom=meterY(target-tolerance);
  const description=inZone?'Garden with water flowing and the flowerpot glowing.':
    flowing?'Garden with water flowing onto the flowerpot.':'Illustrated garden with a flower and watering can.';

  return <div className="garden-visual">
    <svg className="garden-scene" viewBox="0 0 640 382" data-preview={preview||undefined}
    data-daylight={preview||daylight||undefined} data-in-zone={inZone||undefined} data-rewarded={rewarded||undefined} role="img" aria-label={description}>
      <defs>
        <linearGradient id={id+'-sky'} x1="0" y1="0" x2="0.86" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#111d32"/><stop offset=".56" stopColor="#233952"/><stop offset="1" stopColor="#365951"/>
        </linearGradient>
        <linearGradient id={id+'-dawn'} x2="0" y2="1">
          <stop stopColor="#4c527c"/><stop offset=".53" stopColor="#bc7391"/>
          <stop offset=".78" stopColor="#ef9e82"/><stop offset="1" stopColor="#ffcf83"/>
        </linearGradient>
        <linearGradient id={id+'-day'} x2="0" y2="1">
          <stop stopColor="#6bafd0"/><stop offset=".45" stopColor="#b9dfe3"/>
          <stop offset=".75" stopColor="#ffe1a6"/><stop offset="1" stopColor="#ffc58d"/>
        </linearGradient>
        <radialGradient id={id+'-sun-aura'}>
          <stop stopColor="#fff2b6" stopOpacity=".88"/><stop offset=".45" stopColor="#ffe396" stopOpacity=".49"/>
          <stop offset="1" stopColor="#ffe7a8" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id={id+'-sun-core'} cx=".4" cy=".38" r=".69">
          <stop stopColor="#fffbd6"/><stop offset=".65" stopColor="#ffeaa0"/><stop offset="1" stopColor="#f6bd51"/>
        </radialGradient>
        <linearGradient id={id+'-sun-sweep'}>
          <stop stopColor="#fff0c7" stopOpacity="0"/><stop offset=".52" stopColor="#fff6d9" stopOpacity=".63"/>
          <stop offset="1" stopColor="#fff0c7" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={id+'-sunlit-hill'} x2=".82" y2="1">
          <stop stopColor="#a6b19b"/><stop offset="1" stopColor="#779491"/>
        </linearGradient>
        <linearGradient id={id+'-sunlit-meadow'} x2="0" y2="1">
          <stop stopColor="#688d69"/><stop offset="1" stopColor="#325e59"/>
        </linearGradient>
        <radialGradient id={id+'-glow'}>
          <stop stopColor="#f8e2a5" stopOpacity=".52"/><stop offset=".33" stopColor="#a8bbb0" stopOpacity=".21"/><stop offset="1" stopColor="#82b8a1" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={id+'-moon'} x2=".65" y2="1">
          <stop stopColor="#fdf1c8"/><stop offset="1" stopColor="#d2b0bc"/>
        </linearGradient>
        <linearGradient id={id+'-hill'} x2="1" y2="1">
          <stop stopColor="#324f59"/><stop offset="1" stopColor="#252d45"/>
        </linearGradient>
        <linearGradient id={id+'-ground'} x2="0" y2="1">
          <stop stopColor="#2a4948"/><stop offset="1" stopColor="#162c34"/>
        </linearGradient>
        <linearGradient id={id+'-can'} x2=".46" y2="1">
          <stop stopColor="#b7eee2"/><stop offset=".52" stopColor="#69bfb6"/><stop offset="1" stopColor="#3f8f99"/>
        </linearGradient>
        <linearGradient id={id+'-leaf'} x2="1" y2="1">
          <stop stopColor="#a7dda1"/><stop offset="1" stopColor="#4c9e82"/>
        </linearGradient>
        <linearGradient id={id+'-petal'} x2="0" y2="1">
          <stop stopColor="#fff2bb"/><stop offset=".53" stopColor="#ffc987"/><stop offset="1" stopColor="#ef987e"/>
        </linearGradient>
        <linearGradient id={id+'-pot'} x2="1" y2="1">
          <stop stopColor="#f6bba1"/><stop offset=".55" stopColor="#d98e80"/><stop offset="1" stopColor="#9f5c67"/>
        </linearGradient>
        <linearGradient id={id+'-water'} x2="0" y2="1">
          <stop stopColor="#ddfff3"/><stop offset="1" stopColor="#74d9e2"/>
        </linearGradient>
        <pattern id={id+'-dots'} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r=".75" fill="#d3e2e9" opacity=".15"/>
        </pattern>
        <clipPath id={id+'-meter'}><rect x="525" y="108" width="14" height="144" rx="7"/></clipPath>
      </defs>

      <rect width="640" height="382" fill={paint('sky')}/>
      <rect className="garden-dawn-sky" width="640" height="382" fill={paint('dawn')}/>
      <rect className="garden-day-sky" width="640" height="382" fill={paint('day')}/>
      <g className="garden-night-sky">
        <rect width="640" height="314" fill={paint('dots')}/>
        <ellipse cx="343" cy="163" rx="214" ry="158" fill={paint('glow')}/>
        <g className="garden-stars" fill="#d7efe2" aria-hidden="true">
          {stars.map(([x,y],index)=><circle key={x} cx={x} cy={y} r={index%3===0?1.8:1} opacity={index%3===0?.76:.47}/>)}
          <path d="M200 96v14m-7-7h14M487 123v12m-6-6h12M392 59v10m-5-5h10" stroke="#e7eed6" strokeWidth="1.4" strokeLinecap="round" opacity=".8"/>
        </g>
        <g className="garden-sky-orbit" fill="none" stroke="#c2d4c9" opacity=".24" aria-hidden="true">
          <circle cx="334" cy="143" r="88"/>
          <circle cx="334" cy="143" r="107" strokeDasharray="1 7"/>
          <path d="M217 191c71-91 181-107 245-54" strokeDasharray="3 7"/>
        </g>
        <circle cx="334" cy="143" r="67" fill={paint('moon')} opacity=".91"/>
      </g>
      <g className="garden-morning-clouds" fill="none" stroke="#fff4d9" strokeLinecap="round" aria-hidden="true">
        <path d="M22 129c34-9 58-7 91-10m-73 22c23-4 44-5 59-4M367 73q71-13 131-13m-112 25q45-9 79-8M480 175c52-12 83-11 135-14m-98 23q32-6 65-6" opacity=".7" strokeWidth="3"/>
        <path d="M36 156l33-3m451-48 68-7m-85 119q41-4 75-3" opacity=".58" strokeWidth="1.4"/>
      </g>
      <g className="garden-sun" aria-hidden="true">
        <circle r="108" fill={paint('sun-aura')}/>
        <circle r="54" fill="none" stroke="#fff3bd" strokeWidth="1" opacity=".68"/>
        <circle r="63" fill="none" stroke="#fff5ca" strokeWidth="1.2" strokeDasharray="2 8" opacity=".7"/>
        <path d="M0-71v-11m71 82h11M0 71v11m-71-82h-11m32-50-9-9m109 9 9-9M50 50l9 9m-109-9-9 9" fill="none" stroke="#fff7d4" strokeWidth="1.8" strokeLinecap="round" opacity=".76"/>
        <circle r="39" fill={paint('sun-core')} stroke="#fff1b2" strokeWidth="2"/>
        <path d="M-25-12q8-19 30-17" fill="none" stroke="#fffceb" strokeWidth="3" strokeLinecap="round" opacity=".74"/>
      </g>
      <path className="garden-sun-sweep" d="M135 0h140L140 382H0Z" fill={paint('sun-sweep')} aria-hidden="true"/>
      <path d="M0 252Q85 194 155 241T294 232Q361 175 445 231T640 210V382H0Z" fill={paint('hill')}/>
      <path className="garden-day-landscape" d="M0 252Q85 194 155 241T294 232Q361 175 445 231T640 210V382H0Z" fill={paint('sunlit-hill')}/>
      <path d="M0 290Q117 244 190 289T344 280Q442 235 524 283T640 268V382H0Z" fill="#38595a" opacity=".56"/>
      <path className="garden-day-landscape" d="M0 290Q117 244 190 289T344 280Q442 235 524 283T640 268V382H0Z" fill="#87a881"/>
      <path d="M0 332Q124 308 227 322T424 319Q554 292 640 324V382H0Z" fill={paint('ground')}/>
      <path className="garden-day-landscape" d="M0 332Q124 308 227 322T424 319Q554 292 640 324V382H0Z" fill={paint('sunlit-meadow')}/>
      <path d="M0 349Q120 323 279 347T640 339M30 370Q148 350 236 370M466 366Q557 347 640 364" fill="none" stroke="#86b4a1" opacity=".18"/>
      <g fill="#97c5a9" opacity=".54" aria-hidden="true">
        <path d="M66 349q-8-23-23-26 4 14 23 26m0 0q4-19 16-24-2 17-16 24M91 350q3-13 14-19-1 14-14 19M588 348q-3-23-18-28 1 19 18 28m0 0q6-25 20-27-4 19-20 27M563 354q-4-13-16-17 4 13 16 17"/>
        <circle cx="121" cy="338" r="2"/><circle cx="461" cy="344" r="2"/><circle cx="550" cy="336" r="1.6"/>
      </g>

      <ellipse cx="337" cy="347" rx="119" ry="13" fill="#0f2430" opacity=".58"/>
      <ellipse className="garden-pot-glow" cx="335" cy="341" rx="70" ry="12" fill="none" stroke="#b8f9cb" strokeWidth="3" aria-hidden="true"/>
      <ellipse className="garden-ripple" cx="335" cy="345" rx="64" ry="11" fill="none" stroke="#a7e3b9" strokeWidth="2"/>
      {growth===0&&<ellipse cx="335" cy="273" rx="10" ry="6" fill="#e3c78a"/>}
      <g transform={growth<3?'translate(335 278) scale(.42) translate(-335 -278)':undefined} opacity={growth===0?0:1}><g className="garden-plant">
        <path d="M335 294Q347 251 333 209Q328 186 335 153" fill="none" stroke="#6eb590" strokeWidth="9" strokeLinecap="round"/>
        <path d="M337 264Q277 254 266 221Q312 216 337 264M341 238Q385 191 413 206Q389 237 341 238" fill={paint('leaf')}/>
        <path d="M276 228Q316 242 337 264M341 238Q383 219 404 210" fill="none" stroke="#d1e9b0" strokeWidth="1.6" opacity=".58"/>
        <g className="garden-bloom" visibility={growth<6?'hidden':undefined}>
          {petals.map(angle=><path key={angle} transform={`rotate(${angle} 335 153)`} d="M335 156c-17-5-26-23-21-42 3-12 12-21 21-25 9 4 18 13 21 25 5 19-4 37-21 42Z" fill={paint('petal')} stroke="#ffd6a2" strokeWidth="1.2"/>)}
          <circle cx="335" cy="153" r="25" fill="#472f41" stroke="#fbd28f" strokeWidth="3"/>
          <circle cx="335" cy="153" r="17" fill="#774954"/>
          <path d="M328 145h.1m9-4h.1m9 10h.1m-14 5h.1m8 8h.1m-17-2h.1" fill="none" stroke="#f1bd88" strokeWidth="3" strokeLinecap="round"/>
        </g>
      </g>
      </g>
      <g className="garden-pot" key={'pot-'+targetPulse} data-pop={targetPulse!==null||undefined}>
        <path d="M281 278h111l-16 57q-2 8-11 8h-57q-9 0-11-8Z" fill={paint('pot')}/>
        <path d="M296 300h81m-77 13h72m-69 13h66" stroke="#ffc9aa" strokeWidth="1.3" opacity=".47"/>
        <rect x="274" y="275" width="125" height="17" rx="7" fill="#f4b29b"/>
        <path d="M285 280h102" stroke="#ffdac2" strokeWidth="1.5" strokeLinecap="round" opacity=".75"/>
        {confirmTarget&&<rect className="garden-pot-rim" x="274" y="275" width="125" height="17" rx="7"
          fill="none" stroke="#bbffdc" strokeWidth="4" aria-hidden="true"/>}
      </g>

      {holdFraction>0&&<circle cx="335" cy="296" r="33" fill="none" stroke="#f6d679" strokeWidth="5" pathLength="1" strokeDasharray={holdFraction+' 1'} transform="rotate(-90 335 296)"/>}
      <g className="garden-can" data-flowing={flowing||undefined}>
        <path d="M119 186q-41-33-60 1-13 35 47 38" fill="none" stroke="#488b96" strokeWidth="10" strokeLinecap="round"/>
        <path d="M113 184q-36-24-49 5-8 29 37 32" fill="none" stroke="#a2ded1" strokeWidth="3" strokeLinecap="round" opacity=".72"/>
        <path d="M181 193l61 29-9 16-57-20Z" fill={paint('can')}/>
        <path d="M242 218l14 7-9 20-14-7Z" fill="#c6efe2" stroke="#73b4ba" strokeWidth="1.5"/>
        <path d="M106 167h69q14 0 14 14v42q0 14-14 14h-69q-13 0-13-14v-42q0-14 13-14Z" fill={paint('can')} stroke="#c2e9dc" strokeWidth="1.4"/>
        <path d="M107 180h65m-65 43h66" stroke="#d5f6eb" strokeWidth="2" strokeLinecap="round" opacity=".75"/>
        <path d="M140 208q-10-2-10-9 6 1 10 9m0 0q0-12 9-15 1 9-9 15m0 0v5" fill="none" stroke="#284b59" strokeWidth="1.9" strokeLinecap="round" opacity=".82"/>
      </g>

      {showWater&&<g className="garden-stream" opacity={flowing?(inZone?1:.77):0} aria-hidden="true">
        <path d="M249 237Q276 236 301 281M247 239Q273 246 285 279M252 235Q289 230 312 278" fill="none" stroke="#b3f9f4" strokeWidth="1.25" opacity=".32"/>
        <path className="garden-water-drops" d="M250 238Q277 239 300 278" fill="none" stroke={paint('water')} strokeWidth={flowing?2+flow*9:0} strokeDasharray="2 10" strokeLinecap="round"/>
        <path className="garden-water-splash" d="M290 277l-5-9m10 8v-13m6 13 6-11m-3 13 9-5" fill="none" stroke="#d4fff2" strokeWidth="1.7" strokeLinecap="round"/>
      </g>}

      {targetPulse!==null&&<g key={'hit-'+targetPulse} className="garden-target-hit" transform="translate(307 278)" aria-hidden="true">
        <ellipse className="garden-hit-ripple" rx="20" ry="6" fill="none" stroke="#d2fff0" strokeWidth="3"/>
        <g className="garden-hit-drop">
          <path d="M0-23C-4-14-10-10-10-5a10 10 0 0 0 20 0C10-10 4-14 0-23Z"
            fill="#8af3ec" stroke="#edfff9" strokeWidth="2"/>
          <path d="M-5-8q0 4 3 5" stroke="#edfff9" strokeWidth="2" strokeLinecap="round" fill="none"/>
        </g>
      </g>}

      {rewarded&&<g className="garden-celebration" aria-hidden="true">
        {sparks.map(([x,y])=><path key={x} transform={`translate(${335+x} ${153+y})`} d="M0-6Q1-1 6 0Q1 1 0 6Q-1 1-6 0Q-1-1 0-6Z" fill="#ffe7a7"/>)}
      </g>}

      {showEffort&&<g className="garden-meter">
        <rect x="494" y="78" width="86" height="200" rx="21" fill="#152738" fillOpacity=".87" stroke="#c0e2d6" strokeOpacity=".28"/>
        <text x="537" y="97" textAnchor="middle" className="garden-meter-label">EFFORT</text>
        <rect x="525" y="108" width="14" height="144" rx="7" fill="#456375"/>
        {showTarget&&<>
          <rect className="garden-target" x="516" y={bandTop} width="32" height={bandBottom-bandTop} rx="5"/>
          <path d={`M512 ${bandTop}h41m-41 ${bandBottom}h41`} fill="none" stroke="#a4edc6" strokeWidth="1.2" strokeDasharray="3 3"/>
          <text x="554" y={meterY(target)+4} className="garden-target-label">Aim here</text>
        </>}
        <g clipPath={paint('meter')}><rect className="garden-meter-fill" x="525" y={meterY(level)} width="14" height={144*water} rx="7" fill={paint('water')}/></g>
      </g>}
    </svg>
    <GardenParticles enabled={preview||effects} flow={flow} rewarded={rewarded} protectMeter={showEffort}/>
    {preview&&<span className="garden-interaction-hint">Move across the garden</span>}
  </div>;
}
