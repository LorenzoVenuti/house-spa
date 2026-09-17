import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from './app-context';
import { adapter, defaultMemberId, formatDate, formatTime, memberName } from '../lib/adapter';
import { buildMonthlyActivitySeries, currentHouseholdMonth } from '../lib/activity-series';
import { formatHouseholdDateTimeLocal, householdDateTimeToIso, isoDay } from '../lib/demo-data';
import { can } from '../lib/permissions';
import type { Deal, MealPlanStatus, Role, Task } from '../lib/types';
import { MonthlyActivityChart } from '../ui/MonthlyActivityChart';

const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2);
const idempotency = () => crypto.randomUUID();
const money = (value: number) => `${value >= 0 ? '+' : ''}${value} milli`;
const roleLabels: Record<Role, string> = { participant: 'Partecipante', referee: 'Arbitro', parent: 'Genitore' };
const nfcLabels: Record<string, string> = { arrive: 'Arrivo a casa', leave: 'Uscita da casa', dishes: 'Turno piatti', rubbish: 'Turno spazzatura', parcel: 'Ritiro pacco' };

export function Login() {
  const { snapshot, setMemberId } = useApp();
  const navigate = useNavigate();
  const [selected, setSelected] = useStateLocal(defaultMemberId);
  const activeMembers = snapshot.members.filter((member) => member.active);
  const selectedMemberId = activeMembers.some((member) => member.id === selected) ? selected : (activeMembers[0]?.id ?? '');
  return <div className="page login-page"><div className="login-card card"><span className="brand-mark large">HS</span><p className="eyebrow">HOUSE S.P.A.</p><h1>Bentornato.</h1><p>Scegli il tuo profilo per continuare.</p><label className="field"><span>Profilo</span><select value={selectedMemberId} onChange={(event) => setSelected(event.target.value)}>{activeMembers.map((member) => <option value={member.id} key={member.id}>{member.displayName} · {roleLabels[member.role]}</option>)}</select></label><button className="button button-primary" disabled={!selectedMemberId} onClick={() => { setMemberId(selectedMemberId); navigate('/today'); }}>Continua</button><small>I dati restano solo su questo dispositivo.</small></div></div>;
}

function useStateLocal(initial: string) { const [value, setValue] = React.useState(initial); return [value, setValue] as const; }

export function Today() {
  const { snapshot, member, refresh } = useApp();
  const today = isoDay(0);
  const tasks = snapshot.tasks.filter((task) => task.date === today && task.status !== 'cancelled');
  const myBalance = snapshot.wallet.filter((entry) => entry.memberId === member.id).reduce((sum, entry) => sum + entry.amount, 0);
  const dinner = snapshot.meals.find((meal) => meal.date === today && meal.type === 'dinner' && meal.memberId === member.id);
  const [message, setMessage] = React.useState('');
  const complete = async (task: Task) => { try { await adapter.complete_task({ taskId: task.id, idempotencyKey: idempotency(), performedByMemberId: member.id, source: 'app' }); setMessage('Attività completata. Milli accreditati.'); refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Operazione non riuscita'); } };
  return <><div className="page-heading"><div><p className="eyebrow">{formatDate(today)}</p><h1>Buonasera, {member.displayName}.</h1><p className="lede">Tutto quello che serve per oggi.</p></div><span className="pill">{member.role === 'parent' ? 'AMMINISTRAZIONE' : member.role === 'referee' ? 'ARBITRO' : 'PARTECIPANTE'}</span></div>
    {message && <div className="card notice" role="status">{message}</div>}
    <section className="card-grid hero-grid"><article className="card stat"><span>Il tuo saldo</span><strong>{myBalance}<small> milli</small></strong><Link to="/milli">Vedi movimenti →</Link></article><article className="card stat"><span>A cena</span><strong>{dinner?.status === 'present' ? 'Ci sei' : dinner?.status === 'absent' ? 'Assente' : 'Da decidere'}</strong><MealToggle mealId={dinner?.id} status={dinner?.status} onChange={refresh} /></article><article className="card stat"><span>In casa ora</span><strong>{snapshot.members.filter((item) => item.active && item.home && item.role === 'participant').length}<small> partecipanti</small></strong><span className="muted">Aggiornato con NFC</span></article></section>
    <section><div className="section-heading"><h2>Le cose da fare</h2><Link to="/calendar">Calendario →</Link></div><div className="card-grid task-board">{tasks.map((task) => <TaskCard key={task.id} task={task} member={member} snapshot={snapshot} onComplete={complete} />)}{!tasks.length && <div className="card empty-state">Nessuna attività in programma per oggi.</div>}</div></section>
    {(member.role === 'referee' || member.role === 'parent') && <OperationsCard snapshot={snapshot} refresh={refresh} />}
  </>;
}

function OperationsCard({ snapshot, refresh }: { snapshot: ReturnType<typeof useApp>['snapshot']; refresh: () => void }) {
  const [activityCode, setActivityCode] = React.useState<'rubbish' | 'parcel'>('rubbish');
  const [title, setTitle] = React.useState('Portare fuori la spazzatura');
  const [dueAt, setDueAt] = React.useState(() => formatHouseholdDateTimeLocal(new Date(Date.now() + 4 * 60 * 60_000)));
  const [taskId, setTaskId] = React.useState(''); const [performer, setPerformer] = React.useState(defaultMemberId); const [message, setMessage] = React.useState('');
  const [completionId, setCompletionId] = React.useState(''); const [invalidationReason, setInvalidationReason] = React.useState('');
  const openTasks = snapshot.tasks.filter((task) => ['open', 'assigned'].includes(task.status));
  const validCompletions = snapshot.completions.filter((completion) => completion.status === 'valid').sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  const activeParticipants = snapshot.members.filter((person) => person.active && person.role === 'participant');
  const selectedPerformer = activeParticipants.some((person) => person.id === performer) ? performer : (activeParticipants[0]?.id ?? '');
  const create = async (event: React.FormEvent) => { event.preventDefault(); try { await adapter.create_on_demand_task({ activityCode, title, dueAt: householdDateTimeToIso(dueAt), idempotencyKey: idempotency() }); setMessage('Attività creata e aperta ai partecipanti.'); refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Attività non creata'); } };
  const record = async () => { if (!taskId || !selectedPerformer) return; try { await adapter.complete_task({ taskId, idempotencyKey: idempotency(), performedByMemberId: selectedPerformer, source: 'staff' }); setMessage('Esecutore registrato e ricompensa calcolata.'); refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Esecutore non registrato'); } };
  const invalidate = async () => { if (!completionId || !invalidationReason.trim()) return; try { await adapter.invalidate_task_completion({ completionId, reason: invalidationReason, idempotencyKey: idempotency() }); setCompletionId(''); setInvalidationReason(''); setMessage('Attività annullata: premio stornato e storico conservato.'); refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Attività non annullata'); } };
  return <section className="card operations-card"><div className="section-heading"><div><p className="eyebrow">OPERAZIONI</p><h2>Apri, registra o rettifica un’attività</h2></div><span className="pill">Arbitro / Genitore</span></div>{message && <div className="notice" role="status">{message}</div>}<div className="card-grid"><form onSubmit={create}><label className="field"><span>Tipo</span><select value={activityCode} onChange={(event) => { const code = event.target.value as 'rubbish' | 'parcel'; setActivityCode(code); setTitle(code === 'rubbish' ? 'Portare fuori la spazzatura' : 'Ritirare il pacco Amazon'); }}><option value="rubbish">Spazzatura · 1 milli</option><option value="parcel">Pacco Amazon · 2 milli</option></select></label><label className="field"><span>Titolo</span><input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>Scadenza</span><input required type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label><button className="button button-primary">Crea attività</button></form><div><label className="field"><span>Attività aperta</span><select value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">Seleziona un turno</option>{openTasks.map((task) => <option value={task.id} key={task.id}>{task.title} · {task.rewardMilli} milli</option>)}</select></label><label className="field"><span>Eseguita da</span><select value={selectedPerformer} onChange={(event) => setPerformer(event.target.value)}>{activeParticipants.map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select></label><button type="button" className="button" disabled={!taskId || !selectedPerformer} onClick={() => void record()}>Registra esecutore</button></div><div className="completion-review"><label className="field"><span>Attività dichiarata</span><select value={completionId} onChange={(event) => setCompletionId(event.target.value)}><option value="">Seleziona una registrazione</option>{validCompletions.map((completion) => { const task = snapshot.tasks.find((item) => item.id === completion.taskId); return <option value={completion.id} key={completion.id}>{task?.title ?? 'Attività'} · {memberName(snapshot, completion.performedByMemberId)} · {formatDate(completion.completedAt.slice(0, 10))}</option>; })}</select></label><label className="field"><span>Motivo della rettifica</span><textarea required value={invalidationReason} onChange={(event) => setInvalidationReason(event.target.value)} placeholder="Es. attività dichiarata ma non svolta" /></label><button type="button" className="button button-danger" disabled={!completionId || !invalidationReason.trim()} onClick={() => void invalidate()}>Segna come non svolta</button></div></div></section>;
}

function MealToggle({ mealId, status, onChange }: { mealId?: string; status?: MealPlanStatus; onChange: () => void }) {
  if (!mealId || !status) return null;
  return <button className="button button-quiet" onClick={() => void adapter.setMealStatus(mealId, status === 'present' ? 'absent' : 'present').then(onChange)}>{status === 'present' ? 'Segna assenza' : 'Segna presenza'}</button>;
}

function TaskCard({ task, member, snapshot, onComplete }: { task: Task; member: { id: string; role: 'participant' | 'referee' | 'parent' }; snapshot: ReturnType<typeof useApp>['snapshot']; onComplete: (task: Task) => void }) {
  const assignedToMe = task.assigneeId === member.id;
  return <article className="card task-card"><div className="task-icon" aria-hidden="true">{task.activityCode === 'dishes' ? '✦' : task.activityCode === 'rubbish' ? '↗' : '□'}</div><div className="task-main"><span className="eyebrow">{task.status === 'completed' ? 'COMPLETATO' : task.status === 'open' ? 'APERTO A TUTTI' : `ASSEGNATO A ${memberName(snapshot, task.assigneeId).toUpperCase()}`}</span><h3>{task.title}</h3><p>Entro le {formatTime(task.dueAt)} · <strong>{task.rewardMilli} milli</strong></p></div>{task.status !== 'completed' && can(member.role, 'complete-own-task') && (assignedToMe || task.status === 'open') && <button className="button button-primary" onClick={() => onComplete(task)}>Fatto</button>}</article>;
}

export function Calendar() {
  const { snapshot, member } = useApp();
  const [chartMonth, setChartMonth] = React.useState(currentHouseholdMonth());
  const chartData = React.useMemo(() => buildMonthlyActivitySeries(snapshot, chartMonth), [snapshot, chartMonth]);
  const dates = Array.from({ length: 7 }, (_, index) => isoDay(index));
  return <><div className="page-heading"><div><p className="eyebrow">SETTIMANA CORRENTE</p><h1>Calendario</h1><p className="lede">Presenze dichiarate e andamento delle attività.</p></div><span className="pill">{snapshot.members.filter((item) => item.active && item.home).length} in casa</span></div><article className="card activity-chart-card"><div className="section-heading"><div><p className="eyebrow">CONTRIBUTI DEL MESE</p><h2>Attività cumulative</h2></div><label className="field compact-month"><span className="sr-only">Mese del grafico</span><input type="month" value={chartMonth} onChange={(event) => setChartMonth(event.target.value)} /></label></div><p className="muted">Ogni attività valida alza di uno la linea del partecipante. Le rettifiche rimuovono il punto dal conteggio.</p><MonthlyActivityChart data={chartData} /></article><section className="calendar-list">{dates.map((date) => <article className="card calendar-day" key={date}><div className="date-label"><strong>{new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))}</strong><span>{new Date(`${date}T12:00:00`).getDate()}</span></div><div className="calendar-content"><MealRoster date={date} type="dinner" snapshot={snapshot} activeMemberId={member.id} />{snapshot.meals.some((meal) => meal.date === date && meal.type === 'lunch') && <MealRoster date={date} type="lunch" snapshot={snapshot} activeMemberId={member.id} />}{snapshot.tasks.filter((task) => task.date === date).map((task) => <div className="task-row" key={task.id}><span>{task.title}</span><span className="pill">{task.status === 'completed' ? 'Fatto' : task.assigneeId === member.id ? 'Tuo turno' : task.status === 'open' ? 'Aperto' : memberName(snapshot, task.assigneeId)}</span></div>)}</div></article>)}</section></>;
}
function MealRoster({ date, type, snapshot, activeMemberId }: { date: string; type: 'lunch' | 'dinner'; snapshot: ReturnType<typeof useApp>['snapshot']; activeMemberId: string }) { const activeMembers = snapshot.members.filter((person) => person.active); const plans = snapshot.meals.filter((meal) => meal.date === date && meal.type === type && activeMembers.some((person) => person.id === meal.memberId)); return <div className="meal-roster"><div className="meal-row"><strong>{type === 'dinner' ? '🍽 Cena' : '☀️ Pranzo'}</strong><span className="eyebrow">{plans.filter((meal) => meal.status === 'present').length}/{activeMembers.length} presenti</span></div><div className="attendance-grid">{activeMembers.map((person) => { const meal = plans.find((item) => item.memberId === person.id); return <div className="attendance-item" key={person.id}><span>{person.displayName}</span>{meal ? <MealStatus meal={meal} editable={person.id === activeMemberId} onChange={(status) => void adapter.setMealStatus(meal.id, status)} /> : <span className="pill">—</span>}</div>; })}</div></div>; }
function MealStatus({ meal, editable, onChange }: { meal: { status: MealPlanStatus }; editable: boolean; onChange?: (status: MealPlanStatus) => void }) { const label = meal.status === 'present' ? 'Presente' : meal.status === 'absent' ? 'Assente' : 'Da confermare'; return editable && onChange ? <button className="pill button-quiet" onClick={() => onChange(meal.status === 'present' ? 'absent' : 'present')}>{label}</button> : <span className="pill">{label}</span>; }

export function Tribunal() {
  const { snapshot, member, refresh } = useApp();
  const [message, setMessage] = React.useState('');
  const incoming = snapshot.takeovers.filter((item) => item.recipientId === member.id && item.status === 'pending');
  const refusals = snapshot.takeovers.filter((item) => item.status === 'refused');
  const completeIncoming = async (takeover: (typeof incoming)[number]) => {
    const task = snapshot.tasks.find((item) => item.id === takeover.taskId);
    if (!task) { setMessage('Turno non trovato: il takeover richiede revisione.'); return; }
    try {
      await adapter.complete_task({ taskId: task.id, idempotencyKey: idempotency(), performedByMemberId: member.id });
      await adapter.resolve_takeover({ takeoverId: takeover.id, resolution: 'completed', idempotencyKey: idempotency() });
      setMessage('Turno eseguito e takeover chiuso.');
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Completamento non riuscito');
    }
  };
  const request = async (task: Task, recipientId: string) => { try { await adapter.create_takeover({ taskId: task.id, recipientMemberId: recipientId, idempotencyKey: idempotency() }); setMessage('Takeover notificato. Il destinatario deve eseguire il turno.'); refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Takeover non riuscito'); } };
  const requestable = snapshot.tasks.filter((task) => task.assigneeId === member.id && task.status !== 'completed' && !snapshot.takeovers.some((takeover) => takeover.taskId === task.id && takeover.status === 'pending'));
  return <><div className="page-heading"><div><p className="eyebrow">SALA DELLE UDIENZE</p><h1>Tribunale</h1><p className="lede">Obblighi, takeover e verdetti in sospeso.</p></div></div>{message && <div className="card notice">{message}</div>}<section className="card-grid"><article className="card"><div className="section-heading"><h2>Richieste per te</h2><span className="pill">{incoming.length}</span></div>{incoming.length ? incoming.map((takeover) => <div className="list-row" key={takeover.id}><div><strong>{memberName(snapshot, takeover.payerId)}</strong><p>ti assegna un turno · {takeover.costMilli} milli</p></div><button className="button button-primary" onClick={() => void completeIncoming(takeover)}>Esegui turno</button></div>) : <div className="empty-state">Nessuna richiesta pendente.</div>}</article><article className="card"><div className="section-heading"><h2>Chiedi un takeover</h2><span className="pill">Costo ×3</span></div>{member.role !== 'participant' ? <div className="empty-state">Solo i partecipanti possono richiedere un takeover.</div> : requestable.length ? requestable.map((task) => <div className="list-row" key={task.id}><div><strong>{task.title}</strong><p>{task.rewardMilli * 3} milli · scegli un compagno</p></div><select className="field inline-select" aria-label={`Destinatario per ${task.title}`} defaultValue=""><option value="" disabled>Destinatario</option>{snapshot.members.filter((item) => item.active && item.role === 'participant' && item.id !== member.id && item.home).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select><button className="button" onClick={(event) => { const select = event.currentTarget.previousElementSibling as HTMLSelectElement; if (select.value) void request(task, select.value); }}>Invia</button></div>) : <div className="empty-state">Nessun turno cedibile.</div>}</article></section>{refusals.length > 0 && member.role === 'parent' && <article className="card"><h2>Da rivedere</h2>{refusals.map((item) => <div className="list-row" key={item.id}><span>{memberName(snapshot, item.recipientId)} ha rifiutato {item.costMilli} milli</span><span className="pill">Conferma genitore</span></div>)}</article>}</>;
}

export function Market() {
  const { snapshot, member, refresh } = useApp();
  const [description, setDescription] = React.useState(''); const [price, setPrice] = React.useState('3'); const [provider, setProvider] = React.useState(''); const [message, setMessage] = React.useState('');
  const providerOptions = snapshot.members.filter((item) => item.active && item.role === 'participant' && item.id !== member.id);
  const selectedProvider = providerOptions.some((item) => item.id === provider) ? provider : (providerOptions[0]?.id ?? '');
  const myDeals = snapshot.deals.filter((deal) => deal.buyerId === member.id || deal.providerId === member.id);
  const create = async (event: React.FormEvent) => { event.preventDefault(); if (!selectedProvider) return; try { await adapter.create_deal({ providerMemberId: selectedProvider, description, priceMilli: Number(price), dueAt: new Date(Date.now() + 86_400_000).toISOString(), idempotencyKey: idempotency() }); setDescription(''); setMessage(`Proposta inviata a ${memberName(snapshot, selectedProvider)}.`); refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Proposta non riuscita'); } };
  return <><div className="page-heading"><div><p className="eyebrow">SCAMBI VOLONTARI</p><h1>Mercato</h1><p className="lede">Favori veri, milli contati, zero nuova moneta.</p></div></div>{message && <div className="card notice">{message}</div>}<section className="card-grid market-grid"><form className="card" onSubmit={create}><h2>Nuovo accordo</h2><label className="field"><span>Chi ti aiuta?</span><select value={selectedProvider} onChange={(event) => setProvider(event.target.value)}>{providerOptions.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></label><label className="field"><span>Descrizione</span><input required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Es. passaggio in stazione" /></label><label className="field"><span>Prezzo in milli</span><input required min="1" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label><button className="button button-primary" disabled={member.role !== 'participant' || !selectedProvider}>Proponi accordo</button></form><article className="card"><div className="section-heading"><h2>I tuoi accordi</h2><span className="pill">{myDeals.length}</span></div>{myDeals.length ? myDeals.map((deal) => <DealRow key={deal.id} deal={deal} member={member.id} snapshot={snapshot} refresh={refresh} />) : <div className="empty-state">Il mercato è calmo. Per ora.</div>}</article></section></>;
}
function DealRow({ deal, member, snapshot, refresh }: { deal: Deal; member: string; snapshot: ReturnType<typeof useApp>['snapshot']; refresh: () => void }) { const incoming = deal.providerId === member; return <div className="list-row"><div><strong>{deal.description}</strong><p>{incoming ? 'per' : 'da'} {memberName(snapshot, incoming ? deal.buyerId : deal.providerId)} · {deal.priceMilli} milli</p></div>{deal.status === 'proposed' && incoming && <button className="button" onClick={() => void adapter.accept_deal({ dealId: deal.id, idempotencyKey: idempotency() }).then(refresh)}>Accetta</button>}{deal.status === 'accepted' && incoming && <button className="button button-primary" onClick={() => void adapter.settle_deal({ dealId: deal.id, idempotencyKey: idempotency() }).then(refresh)}>Conferma</button>}<span className="pill">{deal.status}</span></div>; }

export function Milli() { const { snapshot, member } = useApp(); const entries = snapshot.wallet.filter((entry) => entry.memberId === member.id); const balance = entries.reduce((sum, item) => sum + item.amount, 0); return <><div className="page-heading"><div><p className="eyebrow">PORTAFOGLIO</p><h1>I tuoi milli</h1></div><div className="wallet-total"><strong>{balance}</strong><span>milli disponibili</span></div></div><section className="card-grid"><article className="card stat"><span>Guadagnati con attività</span><strong>{entries.filter((entry) => entry.kind === 'activity_reward').reduce((sum, item) => sum + item.amount, 0)}<small> milli</small></strong></article><article className="card stat"><span>Attività completate</span><strong>{snapshot.tasks.filter((task) => task.status === 'completed' && task.assigneeId === member.id).length}</strong></article></section><article className="card"><div className="section-heading"><h2>Movimenti</h2><span className="pill">Storico locale</span></div><div className="table-wrap"><table><thead><tr><th>Voce</th><th>Data</th><th>Importo</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{entry.label}</td><td>{formatDate(entry.at.slice(0, 10))}</td><td className={entry.amount >= 0 ? 'positive' : 'negative'}>{money(entry.amount)}</td></tr>)}</tbody></table></div></article></>; }

export function Admin() {
  const { snapshot, member, refresh } = useApp();
  const [selected, setSelected] = React.useState('');
  const [status, setStatus] = React.useState<Task['status']>('assigned');
  const [assignee, setAssignee] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [role, setRole] = React.useState<Role>('participant');
  const [familyMessage, setFamilyMessage] = React.useState('');
  const [creatingMember, setCreatingMember] = React.useState(false);
  const [changingMemberId, setChangingMemberId] = React.useState('');
  const selectedAssignee = snapshot.members.some((person) => person.id === assignee && person.active && person.role === 'participant') ? assignee : '';

  const selectTask = (id: string) => {
    setSelected(id);
    const task = snapshot.tasks.find((item) => item.id === id);
    if (task) {
      setStatus(task.status);
      const hasActiveAssignee = snapshot.members.some((person) => person.id === task.assigneeId && person.active && person.role === 'participant');
      setAssignee(hasActiveAssignee ? (task.assigneeId ?? '') : '');
    }
  };
  const correct = async () => {
    if (!selected || !reason) return;
    try {
      await adapter.apply_parent_correction({ targetType: 'task', targetId: selected, reason, changes: { status, assignedMemberId: selectedAssignee || null }, idempotencyKey: idempotency() });
      setMessage('Correzione registrata nell’audit log.');
      setReason('');
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Correzione non riuscita');
    }
  };
  const createMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creatingMember) return;
    setCreatingMember(true);
    setFamilyMessage('');
    try {
      await adapter.create_member({ displayName, role });
      setDisplayName('');
      setRole('participant');
      setFamilyMessage('Profilo aggiunto alla famiglia.');
      refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'errore sconosciuto';
      setFamilyMessage(`Impossibile aggiungere il profilo: ${detail}.`);
    } finally {
      setCreatingMember(false);
    }
  };
  const setMemberActive = async (memberId: string, active: boolean) => {
    if (changingMemberId) return;
    setChangingMemberId(memberId);
    setFamilyMessage('');
    try {
      await adapter.set_member_active({ memberId, active });
      setFamilyMessage(active ? 'Profilo ripristinato.' : 'Profilo rimosso dalle attività future. Lo storico è stato conservato.');
      refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'errore sconosciuto';
      setFamilyMessage(`Impossibile aggiornare il profilo: ${detail}.`);
    } finally {
      setChangingMemberId('');
    }
  };

  if (member.role !== 'parent') return <Navigate to="/today" replace />;
  return <>
    <div className="page-heading"><div><p className="eyebrow">CONTROLLO GENITORI</p><h1>Amministrazione</h1><p className="lede">Correggi i dati senza perdere la storia.</p></div><span className="pill">Solo genitori</span></div>
    {message && <div className="card notice" role="status">{message}</div>}
    <section className="card-grid admin-grid">
      <article className="card family-management">
        <div className="section-heading"><div><p className="eyebrow">PROFILI</p><h2>Gestisci famiglia</h2></div><span className="pill">{snapshot.members.filter((person) => person.active).length} attivi</span></div>
        <p className="muted family-management__intro">Aggiungi, rimuovi o ripristina un profilo. La rimozione lo disattiva per le attività future, ma conserva tutto lo storico.</p>
        {familyMessage && <div className="notice" role="status">{familyMessage}</div>}
        <form className="member-form" onSubmit={(event) => void createMember(event)} aria-busy={creatingMember}>
          <label className="field"><span>Nome profilo</span><input required minLength={2} maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label className="field"><span>Ruolo</span><select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="participant">Partecipante</option><option value="referee">Arbitro</option><option value="parent">Genitore</option></select></label>
          <button className="button button-primary" disabled={creatingMember || displayName.trim().length < 2}>{creatingMember ? 'Aggiunta…' : 'Aggiungi profilo'}</button>
        </form>
        <div className="member-list">
          {snapshot.members.map((person) => {
            const isCurrentMember = person.id === member.id;
            const isChanging = changingMemberId === person.id;
            return <div className="member-row" key={person.id}>
              <div className="member-row__identity"><i className="avatar" style={{ backgroundColor: person.color }}>{initials(person.displayName)}</i><div><strong>{person.displayName}</strong><p>{roleLabels[person.role]}{isCurrentMember ? ' · Profilo in uso' : ''}</p></div></div>
              <div className="member-row__actions"><span className={`pill ${person.active ? 'pill--success' : 'pill--neutral'}`}>{person.active ? 'Attivo' : 'Non attivo'}</span><button type="button" className={`button ${person.active ? 'button-danger' : ''}`} disabled={isChanging || (person.active && isCurrentMember)} title={person.active && isCurrentMember ? 'Il profilo attualmente in uso non può essere rimosso.' : undefined} onClick={() => void setMemberActive(person.id, !person.active)}>{isChanging ? 'Aggiornamento…' : person.active ? 'Rimuovi' : 'Ripristina'}</button></div>
              {person.active && isCurrentMember && <small className="member-row__note">Il profilo attualmente in uso non può essere rimosso.</small>}
            </div>;
          })}
        </div>
      </article>
      <article className="card"><h2>Panoramica famiglia</h2>{snapshot.members.filter((person) => person.active).map((person) => <div className="list-row" key={person.id}><span><i className="avatar" style={{ backgroundColor: person.color }}>{initials(person.displayName)}</i>{person.displayName}</span><span className="pill">{person.home ? 'In casa' : 'Fuori'}</span></div>)}</article>
      <article className="card"><h2>Rettifica un turno</h2><label className="field"><span>Turno</span><select value={selected} onChange={(event) => selectTask(event.target.value)}><option value="">Seleziona</option>{snapshot.tasks.map((task) => <option value={task.id} key={task.id}>{task.title} · {formatDate(task.date)}</option>)}</select></label><label className="field"><span>Stato</span><select value={status} onChange={(event) => setStatus(event.target.value as Task['status'])}><option value="planned">Pianificato</option><option value="open">Aperto</option><option value="assigned">Assegnato</option><option value="completed">Completato</option><option value="expired">Scaduto</option><option value="cancelled">Annullato</option></select></label><label className="field"><span>Assegnatario</span><select value={selectedAssignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Non assegnato</option>{snapshot.members.filter((person) => person.active && person.role === 'participant').map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select></label><label className="field"><span>Motivo obbligatorio</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Es. registrazione NFC errata" /></label><button className="button button-primary" disabled={!selected || !reason} onClick={() => void correct()}>Registra correzione</button></article>
    </section>
  </>;
}

export function NfcAction() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const { member, snapshot, refresh } = useApp();
  const [message, setMessage] = React.useState('Registrazione in corso…');
  const started = React.useRef(false);
  const tagToken = searchParams.get('tag') ?? '';
  const today = isoDay(0);
  const task = token && ['dishes', 'rubbish', 'parcel'].includes(token) ? snapshot.tasks
    .filter((item) => item.date === today && item.activityCode === token && ['open', 'assigned'].includes(item.status))
    .sort((left, right) => Number(right.assigneeId === member.id) - Number(left.assigneeId === member.id) || left.dueAt.localeCompare(right.dueAt))[0] : undefined;
  const label = nfcLabels[token ?? ''] ?? 'Azione NFC';
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      if (!tagToken || !token || !nfcLabels[token]) { setMessage('Tag NFC non valido.'); return; }
      try {
        if (token === 'arrive' || token === 'leave') {
          await adapter.recordPresence(token, 'nfc', tagToken);
          setMessage(token === 'arrive' ? 'Arrivo registrato.' : 'Uscita registrata.');
        } else if (!task) {
          setMessage('Nessun turno aperto corrispondente per oggi.');
          return;
        } else if (member.role !== 'participant') {
          setMessage('Solo i partecipanti possono completare un turno NFC.');
          return;
        } else {
          const result = await adapter.complete_task({ taskId: task.id, idempotencyKey: idempotency(), performedByMemberId: member.id, source: 'nfc', tagToken });
          setMessage(result.alreadyCompleted ? 'Questo turno era già stato registrato.' : `Turno completato automaticamente: +${String(result.rewardMilli)} milli.`);
        }
        refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Azione NFC non registrata');
      }
    };
    void run();
  }, [member.id, member.role, refresh, tagToken, task, token]);
  return <div className="card nfc-card"><span className="brand-mark large">HS</span><p className="eyebrow">TAG NFC · {token}</p><h1>{label}</h1><p>La scansione vale come dichiarazione di {member.displayName}. Genitori e arbitro possono rettificarla successivamente.</p><div className="notice" role="status">{message}</div><Link to="/today">Torna a Oggi</Link></div>;
}

// React is imported as a namespace for compact route components.
import * as React from 'react';
