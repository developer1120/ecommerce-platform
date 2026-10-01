import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUp } from '@/api/authApi';
import { askQuestion, listQuestions, markQuestionHelpful, QUESTIONS_KEY } from '@/api/questionsApi';
import { SEED_QUESTIONS } from '@/data/questions';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

// The mug set has three answered questions; the incense holder has none.
const MUG = { id: 'hk-mug', slug: 'stoneware-mug-set' };
const INCENSE = { id: 'hk-incense', slug: 'ceramic-incense-holder' };

async function shopper(email = 'ada@example.com', name = 'Ada Lovelace') {
  const { token } = await signUp({ name, email, password: 'slow mornings with tea', remember: true });
  return token;
}

const section = () => screen.getByRole('region', { name: /^Questions and answers/ });
const loaded = () => screen.findByRole('region', { name: /^Questions and answers/ });
const entries = () => within(section()).queryAllByRole('article').map((article) => within(article).getByRole('heading').textContent);

describe('questions on the server', () => {
  it('lists answered questions, most helpful first', async () => {
    const page = await listQuestions(MUG.id);
    expect(page.answered).toBe(3);
    expect(page.items.map((entry) => entry.id)).toEqual(['q-mug-1', 'q-mug-2', 'q-mug-3']);
    expect((await listQuestions(MUG.id, { sort: 'recent' })).items[0]!.id).toBe('q-mug-3');
    expect((await listQuestions(MUG.id, { limit: 2 })).items).toHaveLength(2);
  });

  it('takes questions from signed-in shoppers only, once each', async () => {
    await expect(askQuestion('nope', MUG.id, 'Is the glaze lead free?')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const token = await shopper();
    await expect(askQuestion(token, MUG.id, 'Why?')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(askQuestion(token, 'nope', 'Is the glaze lead free?')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const asked = await askQuestion(token, MUG.id, '  Is the glaze   lead free? ');
    expect(asked).toMatchObject({ question: 'Is the glaze lead free?', askedBy: 'Ada L.', helpful: 0 });
    expect(asked.answer).toBeUndefined();
    await expect(askQuestion(token, MUG.id, 'is the glaze lead free?')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('shows unanswered questions only to whoever asked', async () => {
    const ada = await shopper();
    const grace = await shopper('grace@example.com', 'Grace Hopper');
    await askQuestion(ada, MUG.id, 'Is the glaze lead free?');
    expect((await listQuestions(MUG.id, {}, ada)).mine.map((entry) => entry.question)).toEqual(['Is the glaze lead free?']);
    expect((await listQuestions(MUG.id, {}, grace)).mine).toEqual([]);
    expect((await listQuestions(MUG.id)).answered).toBe(3);
  });

  it('counts helpful votes on seeded and asked questions', async () => {
    await markQuestionHelpful('q-mug-3');
    expect((await listQuestions(MUG.id)).items.find((entry) => entry.id === 'q-mug-3')!.helpful).toBe(SEED_QUESTIONS.find((q) => q.id === 'q-mug-3')!.helpful + 1);
    await expect(markQuestionHelpful('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('questions on the product page', () => {
  it('shows answered questions with their answers', async () => {
    renderRoute(`/product/${MUG.slug}`);
    await waitFor(() => expect(entries()).toHaveLength(3));
    expect(within(section()).getByRole('heading', { level: 2 })).toHaveTextContent('Questions and answers (3)');
    const first = within(section()).getAllByRole('article')[0]!;
    expect(first).toHaveTextContent('Are these mugs dishwasher safe?');
    expect(first).toHaveTextContent('The glaze is fired at stoneware temperatures');
    expect(first).toHaveTextContent('Asked by Priya S.');
    expect(first).toHaveTextContent('The Tanelt studio');
  });

  it('searches questions and answers', async () => {
    const user = userEvent.setup();
    renderRoute(`/product/${MUG.slug}`);
    await waitFor(() => expect(entries()).toHaveLength(3));
    await user.type(within(section()).getByRole('searchbox', { name: 'Search questions' }), 'microwave');
    await waitFor(() => expect(entries()).toEqual(['QAre these mugs dishwasher safe?']));
    expect(within(section()).getByText('1 question matches "microwave"')).toBeInTheDocument();

    await user.clear(within(section()).getByRole('searchbox', { name: 'Search questions' }));
    await user.type(within(section()).getByRole('searchbox', { name: 'Search questions' }), 'teapot');
    expect(await within(section()).findByText('No questions match "teapot".')).toBeInTheDocument();
  });

  it('counts a helpful vote once per device', async () => {
    const user = userEvent.setup();
    renderRoute(`/product/${MUG.slug}`);
    await loaded();
    const button = await within(section()).findByRole('button', { name: 'Helpful (9): Does the speckle vary from mug to mug?' });
    await user.click(button);
    expect(await within(section()).findByRole('button', { name: 'Helpful (10): Does the speckle vary from mug to mug?' })).toBeDisabled();
  });

  it('asks signed-out shoppers to sign in, and says when there are none yet', async () => {
    renderRoute(`/product/${INCENSE.slug}`);
    await loaded();
    expect(await within(section()).findByText('No questions about this product yet. Ask the first one.')).toBeInTheDocument();
    expect(within(section()).getByRole('link', { name: 'Sign in to ask a question' })).toHaveAttribute(
      'href',
      `/account/sign-in?next=${encodeURIComponent(`/product/${INCENSE.slug}#questions`)}`,
    );
    expect(within(section()).queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('lets a signed-in shopper ask, and shows it as waiting', async () => {
    const user = userEvent.setup();
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(await shopper()));
    renderRoute(`/product/${INCENSE.slug}`);
    await loaded();
    const box = await within(section()).findByLabelText('Ask a question');

    await user.click(within(section()).getByRole('button', { name: 'Send question' }));
    expect(within(section()).getByText('Write your question')).toBeInTheDocument();

    await user.type(box, 'Does it come with incense?');
    expect(within(section()).getByText(/26 \/ 300/)).toBeInTheDocument();
    await user.click(within(section()).getByRole('button', { name: 'Send question' }));

    expect(await screen.findByText('Thanks for your question')).toBeInTheDocument();
    expect(await within(section()).findByRole('heading', { name: 'Your questions' })).toBeInTheDocument();
    expect(within(section()).getByText('Does it come with incense?')).toBeInTheDocument();
    expect(within(section()).getByText('Waiting for an answer')).toBeInTheDocument();
    expect(box).toHaveValue('');
    expect(JSON.parse(localStorage.getItem(QUESTIONS_KEY)!)).toHaveLength(1);
  });
});
