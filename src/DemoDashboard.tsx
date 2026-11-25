import {BandResults} from './Evaluation';
import {mean} from './signal';
import type {TrialResult} from './session';

type DemoDashboardProps={
  source:string;
  effort:string;
  target:string;
  classification:string;
  heldOut:boolean;
  replay:boolean;
  results?:TrialResult[];
};

const blocks=[['baseline','Before practice'],['final','After practice']] as const;
const metrics=[['inZone','Time in target'],['error','Target error']] as const;

function PracticeComparison({results}:{results:TrialResult[]}){
  return <div className="demo-comparison">
    <BandResults rows={results} compact/>
    {blocks.map(([block,label])=>{
      const trials=results.filter(trial=>trial.block===block);
      const valid=trials.filter(trial=>trial.valid);
      return <div key={block} className="demo-comparison-card">
        <div className="demo-comparison-heading">
          <h3>{label}</h3>
          <span>{valid.length} / {trials.length} valid trials</span>
        </div>
        <dl className="demo-comparison-metrics">
          {metrics.map(([metric,name])=>{
            const values=valid.flatMap(trial=>trial[metric]===null?[]:[trial[metric]]);
            const value=values.length?mean(values):null;
            return <div key={metric}><dt>{name}</dt><dd>{value===null?'Not available':`${Math.round(value*100)}%`}</dd></div>;
          })}
        </dl>
      </div>;
    })}
  </div>;
}

export function DemoDashboard({source,effort,target,classification,heldOut,replay,results}:DemoDashboardProps){
  return <section className="demo-dashboard" id="demo-dashboard" aria-label="Session details">
    <div className="demo-dashboard-heading">
      <h2>{!heldOut&&!replay&&results?'Practice comparison':'Session details'}</h2>
      <span className="demo-source"><span>Signal source</span> {source}</span>
    </div>
    {heldOut?<p className="demo-context">Live feedback is hidden during test examples.</p>:
      replay?<p className="demo-context">Recording replay for inspection.</p>:
      results?<PracticeComparison results={results}/>:
      <dl className="demo-live">
        <div><dt>Current effort</dt><dd>{effort}</dd></div>
        <div><dt>Target range</dt><dd>{target}</dd></div>
        <div><dt>Classification</dt><dd>{classification}</dd></div>
      </dl>}
  </section>;
}
