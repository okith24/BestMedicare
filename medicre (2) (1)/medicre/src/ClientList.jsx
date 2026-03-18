export default function ClientList({ clients = [] }) {
  return (
    <div className="glass card clients">
      <h3>Most Visited Clients</h3>

      {clients.length === 0 ? (
        <div className="no-results">No recent patient visits.</div>
      ) : (
        clients.map((client, i) => (
          <div key={`${client.email || client.name || "client"}-${i}`} className="client-row">
            <div>
              <strong>{client.name}</strong>
              <p>{`${client.service} - ${client.lastVisit}`}</p>
            </div>
            <button className="tag btnGhost" type="button">{`${client.visits} Visits`}</button>
          </div>
        ))
      )}
    </div>
  );
}
