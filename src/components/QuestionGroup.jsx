function QuestionGroup({ title, description, items, responses, onToggle }) {
  return (
    <section className="question-group">
      <div className="question-group-header">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="question-list">
        {items.map((item) => (
          <label className="question-row" key={item.id}>
            <div>
              <strong>{item.question}</strong>
              {item.autoSelected ? (
                <span className="question-tag">Pre-filled from airport and weather data</span>
              ) : null}
              {item.advisoryOnly ? (
                <span className="question-tag advisory-tag">Advisory only</span>
              ) : null}
            </div>
            <div className="toggle-group" role="group" aria-label={item.question}>
              <button
                type="button"
                className={responses[item.id] ? 'toggle active' : 'toggle'}
                onClick={() => onToggle(item.id, true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={!responses[item.id] ? 'toggle active off' : 'toggle off'}
                onClick={() => onToggle(item.id, false)}
              >
                No
              </button>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}

export default QuestionGroup;
