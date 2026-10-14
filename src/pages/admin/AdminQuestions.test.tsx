import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn, signUp } from '@/api/authApi';
import { loadOutbox } from '@/api/outbox';
import { answerQuestion, askQuestion, listQuestionInbox, listQuestions, setQuestionHidden } from '@/api/questionsApi';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

const MUG = { id: 'hk-mug', slug: 'stoneware-mug-set', name: 'Stoneware mug set' };
const INCENSE = { id: 'hk-incense', slug: 'ceramic-incense-holder' };

async function admin() {
  const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
  return token;
}

async function shopper(email = 'ada@example.com', name = 'Ada Lovelace') {
  const { token } = await signUp({ name, email, password: 'slow mornings with tea', remember: true });
  return token;
}

const main = () => within(screen.getByRole('main'));
const cards = () => main().queryAllByRole('article').map((card) => within(card).getByRole('heading', { level: 3 }).textContent);
const card = (question: string) => main().getByRole('article', { name: question });

describe('the question inbox on the server', () => {
  it('is for admins only', async () => {
    const ada = await shopper();
    const asked = await askQuestion(ada, MUG.id, 'Is the glaze lead free?');
    await expect(listQuestionInbox(ada, 'unanswered')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(answerQuestion(ada, asked.id, 'Yes it is.')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(setQuestionHidden(ada, asked.id, true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listQuestionInbox('nope', 'unanswered')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('lists only questions shoppers asked, oldest unanswered first, with counts', async () => {
    const ada = await shopper();
    const first = await askQuestion(ada, MUG.id, 'Is the glaze lead free?');
    vi.advanceTimersByTime(60_000);
    const second = await askQuestion(ada, INCENSE.id, 'Does it come with incense?');
    const token = await admin();

    const inbox = await listQuestionInbox(token, 'unanswered');
    expect(inbox.items.map((entry) => entry.id)).toEqual([first.id, second.id]);
    expect(inbox.items[0]).toMatchObject({ productName: MUG.name, productSlug: MUG.slug });
    expect(inbox.counts).toEqual({ unanswered: 2, answered: 0, hidden: 0 });
    expect((await listQuestionInbox(token, 'answered')).items).toEqual([]);
  });

  it('checks answers, and emails the shopper only the first time', async () => {
    const asked = await askQuestion(await shopper(), MUG.id, 'Is the glaze lead free?');
    const token = await admin();
    await expect(answerQuestion(token, asked.id, ' ')).rejects.toMatchObject({ code: 'VALIDATION', message: 'Write an answer' });
    await expect(answerQuestion(token, asked.id, 'x'.repeat(1001))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(answerQuestion(token, 'nope', 'Yes it is.')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const answered = await answerQuestion(token, asked.id, '  Yes, every glaze we use is lead free.  ');
    expect(answered.answer).toMatchObject({ text: 'Yes, every glaze we use is lead free.', by: 'The Tanelt studio' });
    expect(loadOutbox()).toHaveLength(1);
    expect(loadOutbox()[0]).toMatchObject({ to: 'ada@example.com', subject: `Your question about ${MUG.name} was answered` });

    await answerQuestion(token, asked.id, 'Yes, and food safe too.');
    expect(loadOutbox()).toHaveLength(1);
    expect((await listQuestionInbox(token, 'answered')).items[0]!.answer!.text).toBe('Yes, and food safe too.');
  });

  it('puts answers on the product page, and takes hidden questions off it', async () => {
    const asked = await askQuestion(await shopper(), MUG.id, 'Is the glaze lead free?');
    const token = await admin();
    await answerQuestion(token, asked.id, 'Yes, every glaze we use is lead free.');
    expect((await listQuestions(MUG.id)).answered).toBe(4);

    await setQuestionHidden(token, asked.id, true);
    expect((await listQuestions(MUG.id)).answered).toBe(3);
    expect((await listQuestionInbox(token, 'hidden')).items.map((entry) => entry.id)).toEqual([asked.id]);
    expect((await listQuestionInbox(token, 'answered')).counts).toEqual({ unanswered: 0, answered: 0, hidden: 1 });
  });
});

describe('the questions page', () => {
  async function signedInAdmin() {
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(await admin()));
  }

  it('is in the admin menu and says when nothing is waiting', async () => {
    await signedInAdmin();
    renderRoute('/admin/questions');
    expect(await main().findByRole('heading', { name: 'Questions', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Questions' })).toHaveAttribute('aria-current', 'page');
    expect(await main().findByText('Every question has an answer. Nice work.')).toBeInTheDocument();
    expect(main().getByRole('button', { name: 'Unanswered, 0 questions' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('publishes an answer, which moves the question to Answered', async () => {
    const user = userEvent.setup();
    await askQuestion(await shopper(), MUG.id, 'Is the glaze lead free?');
    await signedInAdmin();
    renderRoute('/admin/questions');
    await waitFor(() => expect(cards()).toEqual(['Is the glaze lead free?']));
    const question = card('Is the glaze lead free?');
    expect(question).toHaveTextContent('Asked by Ada L.');
    expect(within(question).getByRole('link', { name: MUG.name })).toHaveAttribute('href', `/product/${MUG.slug}#questions`);

    await user.click(within(question).getByRole('button', { name: 'Publish answer' }));
    expect(within(question).getByText('Write an answer')).toBeInTheDocument();
    expect(within(question).getByLabelText('Your answer')).toHaveAttribute('aria-invalid', 'true');

    await user.type(within(question).getByLabelText('Your answer'), 'Yes, every glaze we use is lead free.');
    await user.click(within(question).getByRole('button', { name: 'Publish answer' }));
    expect(await screen.findByText('Answer published')).toBeInTheDocument();
    expect(await main().findByText('Every question has an answer. Nice work.')).toBeInTheDocument();
    expect(loadOutbox()).toHaveLength(1);

    await user.click(main().getByRole('button', { name: 'Answered, 1 question' }));
    await waitFor(() => expect(cards()).toEqual(['Is the glaze lead free?']));
    expect(card('Is the glaze lead free?')).toHaveTextContent('Yes, every glaze we use is lead free.');
  });

  it('edits an existing answer', async () => {
    const user = userEvent.setup();
    const asked = await askQuestion(await shopper(), MUG.id, 'Is the glaze lead free?');
    await answerQuestion(await admin(), asked.id, 'Yes.');
    await signedInAdmin();
    renderRoute('/admin/questions?show=answered');
    await waitFor(() => expect(cards()).toEqual(['Is the glaze lead free?']));
    const question = card('Is the glaze lead free?');

    await user.click(within(question).getByRole('button', { name: 'Edit answer' }));
    const box = within(question).getByLabelText('Edit the answer');
    expect(box).toHaveValue('Yes.');
    await user.clear(box);
    await user.type(box, 'Yes, and food safe too.');
    await user.click(within(question).getByRole('button', { name: 'Save answer' }));
    expect(await screen.findByText('Answer updated')).toBeInTheDocument();
    await waitFor(() => expect(card('Is the glaze lead free?')).toHaveTextContent('Yes, and food safe too.'));
    expect(loadOutbox()).toHaveLength(1);
  });

  it('hides a question and shows it again', async () => {
    const user = userEvent.setup();
    await askQuestion(await shopper(), MUG.id, 'Is this a real question?');
    await signedInAdmin();
    renderRoute('/admin/questions');
    await waitFor(() => expect(cards()).toHaveLength(1));

    await user.click(within(card('Is this a real question?')).getByRole('button', { name: 'Hide' }));
    expect(await screen.findByText('Question hidden')).toBeInTheDocument();
    expect(await main().findByRole('button', { name: 'Hidden, 1 question' })).toBeInTheDocument();
    await user.click(main().getByRole('button', { name: 'Hidden, 1 question' }));
    await waitFor(() => expect(cards()).toEqual(['Is this a real question?']));
    expect(within(card('Is this a real question?')).queryByLabelText('Your answer')).not.toBeInTheDocument();

    await user.click(within(card('Is this a real question?')).getByRole('button', { name: 'Show' }));
    expect(await screen.findByText('Question shown')).toBeInTheDocument();
    expect(await main().findByText('No hidden questions.')).toBeInTheDocument();
  });
});
