/**
 * A fully synthetic export for the demo. "Jordan Avery", every relative,
 * employer and address are invented. Card, IBAN and ID numbers are public
 * test values (Stripe test card, the ISO 13616 example IBAN, a checksum-valid
 * placeholder national ID) and API keys are fake.
 */

const t = (iso: string) => Date.parse(iso) / 1000;

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

function chatGptConversation(
  id: string,
  title: string,
  turns: Turn[],
  extra: Record<string, unknown>[] = [],
) {
  const mapping: Record<string, unknown> = {
    root: { id: 'root', message: null, parent: null, children: [] },
  };
  let parent = 'root';
  [...extra, ...turns.map((turn) => ({ turn }))].forEach((entry, index) => {
    const nodeId = `${id}-n${index}`;
    const message =
      'turn' in entry
        ? {
            id: nodeId,
            author: { role: (entry as { turn: Turn }).turn.role },
            create_time: t((entry as { turn: Turn }).turn.at),
            content: { content_type: 'text', parts: [(entry as { turn: Turn }).turn.text] },
          }
        : { id: nodeId, ...entry };
    mapping[nodeId] = { id: nodeId, message, parent, children: [] };
    parent = nodeId;
  });
  return {
    id,
    conversation_id: id,
    title,
    create_time: t(turns[0].at),
    update_time: t(turns.at(-1)!.at),
    mapping,
    current_node: parent,
  };
}

export const DEMO_CHATGPT = [
  chatGptConversation(
    'demo-a7f3c2e1-meal-plan',
    'Weekly meal plan',
    [
      {
        role: 'user',
        at: '2026-03-02T18:04:00Z',
        text: 'Can you plan five vegetarian dinners? My 7-year-old daughter Mila has a peanut allergy, so no nuts at all.',
      },
      {
        role: 'assistant',
        at: '2026-03-02T18:04:20Z',
        text: 'Here are five nut-free vegetarian dinners that work well for Mila…',
      },
    ],
    [
      {
        author: { role: 'user' },
        create_time: t('2026-03-02T18:03:00Z'),
        content: {
          content_type: 'user_editable_context',
          user_profile: 'I live in Portland, Oregon with my partner Sam and our daughter.',
          user_instructions: 'Keep answers short. I prefer metric units.',
        },
      },
    ],
  ),
  chatGptConversation('demo-b81d44f0-budget', 'Help me build a budget', [
    {
      role: 'user',
      at: '2026-04-11T07:40:00Z',
      text: 'My salary is $86,500 a year and I owe about $14,200 on my credit card debt. My credit score is 640. Where should I start?',
    },
    { role: 'assistant', at: '2026-04-11T07:40:30Z', text: 'Start with the highest-interest balance first…' },
    {
      role: 'user',
      at: '2026-04-11T07:46:00Z',
      text: 'For the transfer, my IBAN is GB82 WEST 1234 5698 7654 32. Is that format right?',
    },
  ]),
  chatGptConversation('demo-c0a9e7b2-sleep', 'Sleep and stress', [
    {
      role: 'user',
      at: '2026-05-19T23:12:00Z',
      text: "I've been on sertraline for anxiety since March and I still have insomnia most nights.",
    },
    {
      role: 'assistant',
      at: '2026-05-19T23:12:40Z',
      text: 'It may help to talk with your prescriber about timing…',
    },
    {
      role: 'user',
      at: '2026-05-19T23:15:00Z',
      text: 'My therapist suggested journaling. My mom Linda thinks I should just exercise more.',
    },
  ]),
  chatGptConversation('demo-d4e2b9a6-deploy', 'Fix my deploy script', [
    {
      role: 'user',
      at: '2026-06-08T10:02:00Z',
      text: 'I work at Brightfield Labs and this is internal only. Why does this fail?\n\nOPENAI_API_KEY=sk-proj-DEMOx9Qa7Lm2Rt5Vb8Nc1Zd4Hf6Jk3Pw0Ys\nDATABASE_URL=postgres://admin:hunter2demo@db.internal.example:5432/app',
    },
    {
      role: 'assistant',
      at: '2026-06-08T10:02:30Z',
      text: 'Never commit secrets. The connection string is missing SSL options…',
    },
  ]),
  chatGptConversation('demo-e5f1a3c8-cover-letter', 'Cover letter draft', [
    {
      role: 'user',
      at: '2026-07-21T15:30:00Z',
      text: "My name is Jordan Avery, I'm 34 years old and I'm a senior data analyst at Brightfield Labs. You can reach me at jordan.avery@example.com or +1 (503) 555-0142.",
    },
    { role: 'assistant', at: '2026-07-21T15:31:00Z', text: 'Dear hiring manager, I am writing to apply…' },
  ]),
  chatGptConversation('demo-f2b7d1e9-question', 'What is diabetes?', [
    {
      role: 'user',
      at: '2026-08-02T09:00:00Z',
      text: 'What is the difference between type 1 and type 2 diabetes?',
    },
    { role: 'assistant', at: '2026-08-02T09:00:20Z', text: 'Type 1 diabetes is an autoimmune condition…' },
  ]),
];

/** Synthetic Claude-shaped transcripts, separate from the ChatGPT export fixture. */
export const DEMO_TRANSCRIPTS = [
  {
    uuid: '6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5',
    name: 'Visa paperwork',
    created_at: '2026-09-03T12:00:00Z',
    updated_at: '2026-09-03T12:20:00Z',
    chat_messages: [
      {
        uuid: 'm1',
        sender: 'human',
        created_at: '2026-09-03T12:00:00Z',
        text: 'My visa expires in June and my lawyer says I should renew early. My passport number is X1234567. What documents do I need?',
        content: [],
        attachments: [],
        files: [{ file_name: 'bank-statement-september.pdf' }],
      },
      {
        uuid: 'm2',
        sender: 'assistant',
        created_at: '2026-09-03T12:00:30Z',
        text: 'You will usually need proof of funds…',
        content: [],
      },
    ],
  },
  {
    uuid: '7a2b3c4d-5e6f-4a7b-9c8d-0e1f2a3b4c5d',
    name: 'Landlord dispute',
    created_at: '2026-10-14T19:00:00Z',
    updated_at: '2026-10-14T19:25:00Z',
    chat_messages: [
      {
        uuid: 'm3',
        sender: 'human',
        created_at: '2026-10-14T19:00:00Z',
        text: 'My landlord Carl refuses to return my deposit. My address is 2417 Alder Street, Apt 5. The refund should go to my card 4242 4242 4242 4242.',
        content: [],
        attachments: [],
        files: [],
      },
      {
        uuid: 'm4',
        sender: 'assistant',
        created_at: '2026-10-14T19:01:00Z',
        text: 'Here is a polite demand letter you can adapt…',
        content: [],
      },
    ],
  },
];

export const DEMO_MEMORIES = [
  { memory: 'Has a daughter named Mila who has a peanut allergy.' },
  { memory: 'Works at Brightfield Labs as a data analyst.' },
  { memory: 'Is training for a half marathon in October.' },
];

export function demoFiles(): { name: string; bytes: Uint8Array }[] {
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  return [
    { name: 'chatgpt-demo/conversations.json', bytes: encode(DEMO_CHATGPT) },
    { name: 'claude-demo/conversations.json', bytes: encode(DEMO_TRANSCRIPTS) },
    { name: 'demo-memories.json', bytes: encode(DEMO_MEMORIES) },
  ];
}
