export async function fetchAiExplanation(assessmentResult) {
  const response = await fetch('/api/ai-explanation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      assessmentResult
    })
  });

  if (!response.ok) {
    let message = 'Live AI explanation is unavailable.';

    try {
      const errorPayload = await response.json();
      message = errorPayload.message || message;
    } catch {
      const errorText = await response.text();
      message = errorText || message;
    }

    throw new Error(message);
  }

  return response.json();
}

export function getUnavailableAiExplanation(message) {
  return {
    available: false,
    status: 'unavailable',
    summary: '',
    message:
      message ??
      'Live AI explanation is unavailable. The deterministic score and recommendation remain valid without it.'
  };
}
