# House S.p.A. — Product Decisions

Status: version 1.1.3 implemented locally; managed-service integration and deployment remain unperformed.
Last updated: 2026-09-16.

This document records the current product decisions. Explicit corrections replace earlier proposals. Open questions below are not implemented rules. The product name is **House S.p.A.**. Product and technical documentation use English; the interface uses Italian.

## 1. Purpose and scope

Build a polished app or web app for everyday family chores, combining practical scheduling with a humorous domestic tribunal, an internal currency, compulsory delegation, negotiated favors, and auctions.

NFC tags are available for the household, but their model and compatibility with family phones have not yet been verified.

The application and its household data are private. Hosting and deployment remain separate operational decisions.

Start with three ordinary activities. Broader features should be delivered incrementally; badges, AI, messaging integrations, and similar earlier brainstorming ideas are not required first-version scope.

## 2. People and authority

| Person | Role | Confirmed authority |
| --- | --- | --- |
| Child 1 | Competing child | Earn and spend milli; participate in turns, takeovers, private deals, and auctions |
| Child 2 | Competing child | Same participant rights |
| Child 3 | Competing child | Same participant rights |
| Mamma | Parent administrator | Manage and correct assignments, attendance, results, balances, fines, and prizes, including retrospectively |
| Papà | Parent administrator | Same administrator rights |
| Cleaning Lady | Referee | Create tasks and record who performed them; cannot issue prizes or fines |

The public demo uses the fixed, anonymized display names Child 1, Child 2, Child 3, Mamma, Papà, and Cleaning Lady.

Family meal and activity calendars include parents as well as children. Cleaning Lady is an additional profile; her inclusion as a meal attendee is not explicitly settled.

Only the three children earn activity rewards and compete for the Reserve. Recording a parent or Cleaning Lady as the performer does not create participant rewards.

Children can confirm their own activity completion and immediately receive the applicable reward. Parents retain control and can correct or reverse results. Infringements are flagged for parental confirmation before penalties are applied.

Corrections must retain the author, reason, and previous values. Cleaning Lady's exact permissions beyond task creation and performer recording remain to be specified.

Parent administrators manage family profiles. They can create a uniquely named participant, parent, or referee profile and can deactivate or reactivate an existing profile. Deactivation preserves the member and all historical relationships, removes the profile from future-facing selection and scheduling, and blocks it from acting. A parent cannot deactivate the profile currently in use or the final active parent.

## 3. Currency and Reserve

- The game currency is **milli**, not points or credits.
- Milli are earned through activities and transferred through agreed private favors.
- Earning milli does not create a right to redeem them for money.
- The **Reserve** contains real euros collected through fines and debt settlements.
- Fine conversion is **1 milli = EUR 1**.
- Milli balances and outstanding debts carry over between months. Monthly ranking statistics restart each month; history is retained.
- Prize delivery requires parental confirmation and is not automatic.
- The application must distinguish recording a payment or award from actually transferring money. No payment provider has been selected.

## 4. Ordinary activities

| Activity | Base reward | Creation |
| --- | ---: | --- |
| Wash the dishes | 3 milli | Every day at 20:30 for dinner; also Saturday and Sunday at 13:00 for lunch |
| Take out the rubbish | 1 milli | Created when needed by Mamma, Papà, or Cleaning Lady |
| Collect an Amazon parcel | 2 milli | Created when needed by Mamma, Papà, or Cleaning Lady |

The scheduler assigns on-demand tasks among available children. Task deadlines and the definition of one completion still need specification.

### Single-participant reward

Availability and reward are fixed when the task opens, not when the weekly plan is generated or when completion is recorded.

If exactly one competing child is available at opening, the reward is half the base value, rounded upward:

`reward = ceil(base_reward / 2)`

This gives dishes 2 milli, rubbish 1 milli, and parcel collection 1 milli. Parents do not count toward the number of available competing children. Later arrivals or departures do not change the fixed reward.

The scheduler still balances work using the full base value, before this reward adjustment. Whether the adjustment also affects auction rewards has not been decided.

## 5. Attendance and family calendar

Keep two distinct concepts:

1. Planned meal attendance: present, absent, or unconfirmed for lunch and dinner on each date.
2. Actual presence at home: check-in and check-out using two distinct NFC tags, with manual correction available.

Scanning an NFC tag is itself a declaration: it records the action immediately without another confirmation screen. Arrival and departure use separate tags rather than toggling one ambiguous state. Completing an activity from either its NFC tag or the app is immediately considered true. A parent or referee can later invalidate a false completion with a mandatory reason; the immutable history remains, the reward is reversed, and the task is reopened. Household meal planning and future scheduling use planned attendance; takeover eligibility uses actual presence at home.

Being in a hurry to leave does not exempt a participant from a takeover. A participant who is away is not eligible. Leaving after receiving a valid takeover does not automatically cancel it.

A participant who declared absence from dinner may change to present until **21:30**, including after dinner has started. A change after the dishes turn opens at 20:30 does not alter its fixed reward.

Whether the same cutoff permits changing from present to absent is unresolved.

Parents may impose a **EUR 1 fine** when someone declared dinner attendance but did not attend. This payment goes to the Reserve and is separate from the milli balance. Exceptions, applicable family members, and declaration cutoffs need specification.

## 6. Scheduling

- Every Sunday evening, generate the following week's turns, Monday through Sunday, using planned attendance.
- Distribute the workload proportionally to presence, measured using activity base values rather than reduced rewards.
- The exact Sunday generation time and detailed scheduling algorithm remain open.
- When attendance changes, reassign only affected future turns. Leave unrelated assignments unchanged.
- Parent-edited assignments are protected from automatic replacement. Conflicts are flagged for review.
- If no competing child is available, leave the task unassigned without an automatic penalty. A parent or Cleaning Lady can record who performs it.

Behavior for attendance changes after a turn has already opened, other than preserving its reward, still needs definition.

## 7. Hostile takeovers

An eligible participant can require another participant to perform one of their assigned turns. Acceptance is compulsory when the conditions are met.

- The initiator needs at least **15 spendable milli** and enough to cover the takeover cost.
- No requirement to hold twice the recipient's balance remains.
- The recipient must actually be at home.
- The takeover cost is **three times the ordinary activity value**: dishes 9 milli, rubbish 3 milli, parcel collection 6 milli.
- The cost is reserved while the takeover is pending and consumed when fulfilled; it is not transferred to the performer.
- The performer receives the task's applicable activity reward.
- If the recipient refuses, the recipient loses milli equal to the takeover cost. The initiator receives their reserved milli back and resumes responsibility for the turn.
- The same turn cannot be used to impose the same takeover again on that recipient.
- Penalties require parental confirmation.

### Completion attribution

A successfully completed takeover counts as **one completed activity for both the payer and the performer**. This double attribution also applies to the monthly activity/presence eligibility ratio.

Only the performer earns activity milli. Only those earned milli contribute to the monthly earned-milli component. The payer gains no earned milli from purchasing the takeover.

No activity credit is given merely for requesting or paying for an uncompleted takeover.

The three-times cost is recorded using the ordinary values above. Its relationship to reduced single-participant rewards, deadlines, overlapping assignments, onward delegation, and reliability attribution needs explicit resolution.

## 8. Black market

Participants may negotiate voluntary favors outside the ordinary activity list, such as a ride.

Example: Child 3 pays Child 2 3 milli for a ride. Child 3 loses 3 milli and Child 2 receives 3 milli; the transaction creates no new milli.

These transfers do not count as activity earnings in the monthly ranking. Whether they create any activity-count credit has not been explicitly decided.

Agreement and fulfillment confirmation, insufficient funds, cancellations, and disputes remain open. Private favors are voluntary; hostile takeovers follow their separate compulsory rules.

## 9. Occasional tasks and reverse auctions

Mamma or Papà can create an exceptional task with a starting reward, such as collecting a car from the mechanic for 10 milli.

- Participants compete by offering to complete the task for fewer milli.
- The lowest valid offer wins when the auction closes.
- Auctions have a fixed closing time. A bid within the final two minutes moves closing to two minutes after that bid.
- The winning reward is earned after completion.
- The winner must perform the task personally. It cannot be reassigned through a takeover or a black-market deal.
- If the winner fails to perform the task, a parent confirms the failure, the penalty is applied, and the auction is reopened.

### Noncompletion penalty

| Balance at confirmed failure | Penalty |
| --- | --- |
| Positive | All positive milli are removed; the balance becomes zero |
| Zero | An immediately due euro fine equal to the winning bid |
| Negative | Existing negative balance remains; the same immediately due euro fine is added separately |

Example: a winning bid of 9 milli and a balance of -4 results in a EUR 9 fine payable immediately to the Reserve; the milli balance remains -4.

The difference between losing a small positive balance and paying a cash fine at zero is part of the stated rule. Minimum bid, bid ties, no-bid auctions, task deadlines, reopening parameters, and eligibility of an earlier defaulter remain open.

## 10. Negative balances and fines

A milli penalty can create a negative balance. Example: 4 milli minus a 9-milli takeover refusal penalty produces -5 milli.

The participant has **seven days to recover the debt** by earning milli, including through negotiated favors. Any remaining deficit then requires payment to the Reserve at EUR 1 per milli.

Debt settlement reducing the corresponding negative balance and a rule preventing later penalties from restarting the original seven-day deadline were proposed but not explicitly confirmed. Debt timing, separate debt installments, payment confirmation, and unpaid cash-fine handling need a precise contract.

Auction default cash fines are immediately due and do not use the seven-day grace period.

## 11. Monthly ranking and prize

### Ranking components

| Component | Weight |
| --- | ---: |
| Activity milli earned per equivalent day of presence | 50% |
| Completed activity count per equivalent day of presence | 20% |
| Reliability: proportion of assigned commitments completed on time | 30% |

Lunch and dinner each represent half an equivalent day. The authoritative source for actual counted meal attendance still needs confirmation.

Earned milli include completed ordinary tasks and auction rewards. Spending, fines, and black-market transfers do not change historical earned milli. Reduced rewards count as the milli actually earned.

Successfully completed takeovers count toward both participants' activity totals, but award earned milli only to the performer.

The three components need a defined common-scale normalization before applying the weights. The exact formula, zero-denominator cases, and reliability attribution for delegated tasks remain open.

### Eligibility

- Completed activities divided by equivalent days of presence must be **strictly greater than 0.3**.
- There must be a nonzero presence denominator.
- There is no separate minimum number of days or completed tasks.
- A negative milli balance disqualifies a participant; zero does not.

Examples: 5 equivalent days require at least 2 activities; 10 require 4; 20 require 7. The rule permits qualification from one day and one activity.

### Awarding the Reserve

- The app proposes the eligible winner; Mamma or Papà must confirm the prize.
- On confirmed award, the winner's positive milli balance is halved. Rounding is not yet specified.
- If nobody is eligible, the entire Reserve carries forward to the next month.
- In a tie, parents choose either equal division among the tied winners or carrying the full Reserve into the next month, and record that decision.
- If divided, each winner's positive milli balance is halved. If carried forward, nobody's balance is halved.

The eligibility snapshot time, prize amount cutoff, confirmation/payment lifecycle, and treatment of retrospective changes after an award need specification. Real money already paid must not be treated as automatically recovered by editing a record.

## 12. Remaining product decisions

1. Phones and NFC tag compatibility; final identity and login rollout for configured profiles.
2. Definition of a task occurrence and final opening and completion deadlines.
3. Attendance source for ranking; present-to-absent dinner changes; forgotten check-outs and late changes.
4. Exact scheduling algorithm, weekly generation time, tie-breaking, and active-turn reassignment.
5. Takeover timing, reliability attribution, overlapping obligations, and reduced-reward pricing.
6. Black-market agreement, fulfillment, funding, and activity-count rules.
7. Auction bid constraints, absent/no bidders, completion confirmation, and reopening behavior.
8. Debt settlement, aging, unpaid fines, and manual payment confirmation.
9. Ranking normalization, month boundaries, balance-halving rounding, and retrospective recalculation.
10. Later-release scope and product maintenance.

No live provider account, deployment, or real payment integration has been configured.

## 13. Version 1.1.3 implementation baseline

The first implementation is an installable web app optimized for iPhone and also usable from a desktop browser. The current frontend runs in Demo Mode with local browser storage and a profile selector; it has no live authentication, provider connection, or remote family data.

The intended connected-mode architecture uses private, invitation-only email/password accounts through Supabase Auth, with public sign-up disabled. PostgreSQL Row Level Security and server-side role checks enforce family and role boundaries in that future connected mode.

Version 1.1.3 includes:

- role-aware Demo Mode profiles plus connected-mode contracts for family accounts and server-enforced permissions;
- planned and actual meal attendance plus at-home presence;
- weekly scheduling and the three ordinary activities;
- immediate NFC URL entry points with separate arrival and departure tags;
- staff invalidation of false activity claims with reward reversal and retained history;
- a monthly cumulative activity chart with one colored line per participant;
- the milli ledger, balances, and parent corrections;
- hostile takeovers and black-market agreements;
- experimental contribution statistics without awarding the Reserve.

Reverse auctions, euro conversion, debt settlement, monetary fines, Reserve payment, and monthly prize closure are deferred to version 2. Version 1.1.3 may apply parent-confirmed takeover penalties in milli and allow a negative milli balance. No version 1.1.3 balance creates a retroactive euro fine when version 2 is enabled.

The intended managed-service shape for a future family pilot is Cloudflare Pages for the frontend and Supabase for authentication, PostgreSQL, database functions, and scheduled jobs. Resend SMTP would handle invitations and password recovery. Production deployment and provider accounts remain separate external actions.

The following operating defaults are confirmed for version 1.1.3:

- dinner attendance can be changed from present to absent until 20:30, and from absent to present until 21:30;
- actual meal participation is confirmed separately from the plan and is the source used by contribution statistics;
- dinner dishes are due at 23:00 and weekend lunch dishes at 15:00;
- rubbish and parcel tasks propose a four-hour deadline that the creator can change;
- the Sunday schedule is generated at 22:00 Europe/Rome for the following Monday-to-Sunday week;
- black-market transfers do not count as completed activities or earned activity milli;
- the version 1.1.3 leaderboard is informational and does not move money or halve balances.
