import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiChatResponse } from './openaiChatService.js';
import { chatMessageToHistory, normalizeChatContent } from '../src/utils/aiChatResponse.js';

const emptyContent = { message: '', items: [], listType: null, footer: '' };

test('list normalization trims, removes empty values, deduplicates, and caps items and strings', () => {
  for (const value of [undefined, null, 'invalid', 42]) {
    assert.deepEqual(normalizeChatContent(value), emptyContent);
  }
  const answer = normalizeChatContent({
    message: ' Intro. ',
    items: [' First ', '', null, 42, 'first', 'Second item', 'second   item', 'Third', 'Fourth', 'Fifth', 'X'.repeat(300), 'Seventh'],
    listType: ' numbered ',
    footer: ` ${'F'.repeat(300)} `
  });
  assert.equal(answer.message, 'Intro.');
  assert.deepEqual(answer.items, ['First', 'Second item', 'Third', 'Fourth', 'Fifth', 'X'.repeat(240)]);
  assert.equal(answer.listType, 'numbered');
  assert.equal(answer.footer.length, 240);
});

test('invalid list types normalize to null and empty items always clear the type', () => {
  for (const listType of ['invalid', 'BULLET', {}, undefined, null]) {
    assert.deepEqual(normalizeChatContent({ items: [' A '], listType }), {
      ...emptyContent, items: ['A']
    });
  }
  for (const items of [[], [' '], null, 'invalid']) {
    assert.deepEqual(normalizeChatContent({ items, listType: 'numbered' }), emptyContent);
  }
});

test('history includes ordered or bulleted items and the footer', () => {
  assert.deepEqual(chatMessageToHistory({
    role: 'assistant', content: 'Intro.', items: ['First', 'Second'], listType: 'numbered', footer: 'Context.'
  }), { role: 'assistant', content: 'Intro.\n\n1. First\n2. Second\n\nContext.' });
  assert.deepEqual(chatMessageToHistory({ role: 'assistant', content: '', items: ['A'], listType: 'bullet' }), {
    role: 'assistant', content: '- A'
  });
  assert.deepEqual(chatMessageToHistory({ role: 'user', content: 'Plain user text.' }), {
    role: 'user', content: 'Plain user text.'
  });
});

test('chat list contract preserves settings, context, fallbacks, and safe failures', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key-no-network';
  let modelResponse;
  let queuedResponses = [];
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify(queuedResponses.shift() ?? modelResponse), {
      headers: { 'content-type': 'application/json' }
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });

  const responseWithText = (text) => ({
    object: 'response', status: 'completed', model: 'test-model',
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }]
  });
  const respondWithText = (text) => {
    queuedResponses = [];
    modelResponse = responseWithText(text);
  };
  const ask = (options = {}) => createAiChatResponse({ message: 'Explain these risks.', ...options });
  const numberedAnswer = {
    message: 'Use this sequence:',
    items: ['Check the station and valid period.', 'Review wind and visibility.', 'Check clouds and ceilings.', 'Scan change groups.'],
    listType: 'numbered',
    footer: 'Compare conditions with personal minimums and aircraft limitations.',
    followUps: ['Explain the first step', 'Show mitigation ideas']
  };
  const expected = (answer) => ({ ...answer, model: 'test-model' });

  await t.test('schema, caps, reasoning, history limits, and assessment context remain intact', async () => {
    respondWithText(JSON.stringify(numberedAnswer));
    assert.deepEqual(await ask({
      mode: 'result-discussion',
      assessmentContext: { result: { recommendation: 'Don’t go', totalScore: 28 } },
      history: Array.from({ length: 8 }, (_, index) => ({ role: 'assistant', content: `History ${index}` }))
    }), expected(numberedAnswer));
    const request = requests.at(-1);
    assert.equal(request.max_output_tokens, 1000);
    assert.deepEqual(request.reasoning, { effort: 'low' });
    assert.equal(request.store, false);
    assert.equal(request.text.format.strict, true);
    const schema = request.text.format.schema;
    assert.deepEqual(schema.required, ['message', 'items', 'listType', 'footer', 'followUps']);
    assert.equal(schema.properties.items.maxItems, 6);
    assert.equal(schema.properties.items.items.maxLength, 240);
    assert.deepEqual(schema.properties.listType.enum, ['bullet', 'numbered', null]);
    assert.equal(schema.properties.footer.maxLength, 240);
    assert.equal(schema.properties.message.maxLength, undefined);
    assert.equal(request.input.length, 8);
    assert.match(request.input[0].content, /\[APP_CONTEXT\]/);
    assert.match(request.input[0].content, /Don’t go/);
    assert.equal(request.input[1].content, 'History 2');
    assert.match(request.instructions, /listType/);
  });

  await t.test('general chat returns ordered and unordered content without a second call', async () => {
    for (const listType of ['numbered', 'bullet', 'invalid']) {
      respondWithText(JSON.stringify({ ...numberedAnswer, listType }));
      const before = requests.length;
      assert.deepEqual(await ask(), expected({ ...numberedAnswer, listType: listType === 'invalid' ? null : listType }));
      assert.equal(requests.length - before, 1);
      assert.equal(requests.at(-1).text.format.schema.properties.message.maxLength, 240);
      assert.match(requests.at(-1).instructions, /Choose the response structure based on content, not topic/);
    }
  });

  await t.test('simple explanations and concise comparisons do not force a list', async () => {
    for (const message of [
      'A simple explanation.',
      'One concept is broader whereas the other is more specific.',
      'Fog, a cloud near the ground, reduces visibility.'
    ]) {
      const answer = { ...emptyContent, message, followUps: numberedAnswer.followUps };
      respondWithText(JSON.stringify(answer));
      const before = requests.length;
      assert.deepEqual(await ask({ message: 'Compare the concepts.' }), expected(answer));
      assert.equal(requests.length - before, 1);
    }
  });

  await t.test('inline lists, long intros, and closing questions get one bounded corrective rewrite', async () => {
    const invalidAnswers = [
      ...[
        'Check observations, forecasts, and advisories.',
        'Get a briefing. Check forecasts. Compare personal minimums.',
        'Get a briefing; check forecasts; compare personal minimums.',
        '1) First. 2) Second. 3) Third. 4) Fourth.',
        '- First\n- Second\n- Third',
        'A'.repeat(241),
        'Would you like an overview?'
      ].map((message) => ({ ...numberedAnswer, message, items: [], listType: null })),
      { ...numberedAnswer, footer: 'Would you like more detail?' }
    ];
    for (const answer of invalidAnswers) {
      respondWithText(JSON.stringify(answer));
      queuedResponses = [modelResponse, responseWithText(JSON.stringify(numberedAnswer))];
      const before = requests.length;
      assert.deepEqual(await ask(), expected(numberedAnswer));
      assert.equal(requests.length - before, 2);
      assert.match(requests.at(-1).instructions, /REWRITE REQUIRED:/);
      assert.equal(JSON.parse(requests.at(-1).input.at(-1).content).message, answer.message);
      for (const request of requests.slice(before)) {
        assert.equal(request.max_output_tokens, 1000);
        assert.deepEqual(request.reasoning, { effort: 'low' });
      }
    }
  });

  await t.test('repeated violations stop after two calls', async () => {
    respondWithText(JSON.stringify({ ...numberedAnswer, message: '1) First. 2) Second. 3) Third.' }));
    const before = requests.length;
    await assert.rejects(ask(), { code: 'openai_response_contract_violation', statusCode: 502 });
    assert.equal(requests.length - before, 2);
  });

  await t.test('essential clarifications can use a question when followUps is empty', async () => {
    const answer = { ...emptyContent, message: 'Which concept would you like explained?', followUps: [] };
    respondWithText(JSON.stringify(answer));
    assert.deepEqual(await ask(), expected(answer));
  });

  await t.test('assessment discussion stays outside the general-chat rewrite rules', async () => {
    const answer = { ...emptyContent, message: 'First point. Second point. Third point.', followUps: [] };
    respondWithText(JSON.stringify(answer));
    const before = requests.length;
    assert.deepEqual(await ask({ mode: 'result-discussion' }), expected(answer));
    assert.equal(requests.length - before, 1);
    assert.doesNotMatch(requests.at(-1).instructions, /GENERAL CHAT RESPONSE CONTRACT/);
  });

  await t.test('items or footer can render without an intro', async () => {
    for (const answer of [
      { ...numberedAnswer, message: '' },
      { ...emptyContent, footer: 'Brief context.', followUps: [] }
    ]) {
      respondWithText(JSON.stringify(answer));
      assert.deepEqual(await ask(), expected(answer));
    }
  });

  await t.test('legacy, malformed, truncated, and plain-text output safely recover message text', async () => {
    for (const text of [
      'Plain text answer.',
      '{"message":"Plain text answer.","followUps":[]}',
      '{"message":"Plain text answer.","items":{"invalid":true}}',
      '{"message":"Plain text answer.","items":broken}',
      '{"message":"Plain text answer.","items":['
    ]) {
      respondWithText(text);
      assert.deepEqual(await ask(), expected({ ...emptyContent, message: 'Plain text answer.', followUps: [] }));
    }
  });

  await t.test('follow-ups remain deduplicated and previous suggestions are excluded', async () => {
    respondWithText(JSON.stringify({ ...numberedAnswer,
      followUps: [' Explain a step ', 'Explain a step', 'Another topic', 'Previously shown']
    }));
    const answer = await ask({ previousFollowUps: ['Previously shown'] });
    assert.deepEqual(answer.followUps, ['Explain a step', 'Another topic']);
  });

  await t.test('refusals are preserved as plain text with empty list fields', async () => {
    modelResponse = { status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'I cannot help with that.' }] }]
    };
    assert.deepEqual(await ask(), {
      ...emptyContent, message: 'I cannot help with that.', followUps: [], model: process.env.OPENAI_MODEL || 'gpt-5-mini'
    });
  });

  await t.test('unusable incomplete and empty responses still fail safely', async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      for (const [status, reason, code] of [
        ['incomplete', 'max_output_tokens', 'openai_incomplete_response'],
        ['completed', null, 'openai_empty_response']
      ]) {
        modelResponse = { status, incomplete_details: { reason }, output: [] };
        await assert.rejects(ask(), { code, statusCode: 502 });
      }
      respondWithText('{"message":"","items":[" "],"listType":"bullet","footer":"","followUps":[]}');
      await assert.rejects(ask(), { code: 'openai_empty_response', statusCode: 502 });
      respondWithText('{"message":"unfinished');
      await assert.rejects(ask(), { code: 'openai_empty_response', statusCode: 502 });
    } finally {
      console.error = originalError;
    }
  });
});
