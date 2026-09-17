import type { MonthlyActivityChartData } from '../lib/activity-series';

const width = 900;
const height = 320;
const margin = { top: 24, right: 24, bottom: 42, left: 42 };

export function MonthlyActivityChart({ data }: { data: MonthlyActivityChartData }) {
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (day: number) => margin.left + ((day - 1) / Math.max(1, data.days.length - 1)) * plotWidth;
  const y = (value: number) => margin.top + plotHeight - (value / data.max) * plotHeight;
  const yTicks = Array.from(new Set([0, Math.ceil(data.max / 2), data.max])).sort((left, right) => left - right);
  const xTicks = data.days.filter((day) => day === 1 || day === data.days.length || day % 5 === 0);

  return <div className="activity-chart">
    <div className="activity-chart__legend" aria-label="Partecipanti">
      {data.series.map((item) => <span key={item.memberId}><i style={{ backgroundColor: item.color }} />{item.displayName}<strong>{item.values.at(-1) ?? 0}</strong></span>)}
    </div>
    <div className="activity-chart__canvas">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="activity-chart-title activity-chart-description">
        <title id="activity-chart-title">Attività cumulative del mese</title>
        <desc id="activity-chart-description">Una linea per partecipante. Ogni attività valida aumenta il totale di uno.</desc>
        {yTicks.map((tick) => <g key={tick}><line className="activity-chart__grid" x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} /><text className="activity-chart__label" x={margin.left - 10} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
        {xTicks.map((tick) => <text className="activity-chart__label" key={tick} x={x(tick)} y={height - 13} textAnchor="middle">{tick}</text>)}
        {data.series.map((item) => {
          const points = item.values.map((value, index) => `${x(index + 1)},${y(value)}`).join(' ');
          const lastValue = item.values.at(-1) ?? 0;
          return <g key={item.memberId}><polyline className="activity-chart__line" points={points} style={{ stroke: item.color }} /><circle cx={x(data.days.length)} cy={y(lastValue)} r="5" fill={item.color} /></g>;
        })}
      </svg>
    </div>
  </div>;
}
