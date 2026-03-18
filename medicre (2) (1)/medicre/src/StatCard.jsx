export default function StatCard({ title, value, growth, subtitle }) {
  return (
    <div className="glass card stat-card">
      <h3>{title}</h3>
      <div className="stat-value">
        <span>{value}</span>
        <small className="growth">{growth}</small>
      </div>
      <p>{subtitle || "Target reached: 92% of daily capacity"}</p>
    </div>
  );
}
