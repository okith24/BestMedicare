export default function DepartmentCard({ title, value }) {
  const progress = Math.max(0, Math.min(100, value * 2));
  return (
    <div className="glass card department-card">
      <h4>{title}</h4>
      <span className="dept-value">{value}</span>
      <div className="progress-bar">
        <div className="progress" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
