const percent=new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:2});

export function BoardRailCheck({codes}:{codes:readonly number[]}){
  if(!codes.length)return null;
  const fitsTenBit=codes.every(code=>Number.isInteger(code)&&code>=0&&code<=1023);
  const nearLimits=codes.filter(code=>code<=1||code>=1022).length;
  const clipping=fitsTenBit&&nearLimits>0;

  return <section className="board-rail-check" data-clipping={clipping||undefined} aria-label="10-bit ADC rail check">
    <strong>{clipping?'Possible clipping':'Raw ADC rail check'}</strong>
    {fitsTenBit
      ? <span>{nearLimits.toLocaleString('en')} / {codes.length.toLocaleString('en')} near limits ({percent.format(nearLimits/codes.length)})</span>
      : <span>Column 1 falls outside the assumed 10-bit range.</span>}
    <p className="fine">Uses raw Column 1 counts and assumes a 0–1023 ADC range.</p>
  </section>;
}
