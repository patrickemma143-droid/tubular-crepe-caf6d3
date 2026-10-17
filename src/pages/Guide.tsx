import { Link } from 'react-router-dom';

// What staff must record for FarmOS to track each animal well. Kept short and
// practical: each item says what to record, when, and why it matters.

export const GUIDE: { title: string; why: string; items: [string, string][] }[] = [
  {
    title: '1. Identify every animal',
    why: 'Everything else hangs on knowing which animal is which.',
    items: [
      ['Ear-tag every animal', 'When an animal is tagged, open its record (TMP-… number) and type the real tag number. Tag calves within their first week.'],
      ['One number, never reused', 'A tag from a dead or sold animal is never given to another one.'],
      ['Lost tag', 'Re-tag the same day and note the old number in the animal’s notes.'],
    ],
  },
  {
    title: '2. Births — within 24 hours',
    why: 'The calf’s birth date drives its growth forecast, when it can be served, and when it can be sold.',
    items: [
      ['Record the calving on the mother', 'Breeding → Calved. Enter the date, calf sex, and calving ease. FarmOS adds the calf to the herd and links it to its mother.'],
      ['Sire', 'Write the bull’s tag or the semen code. This builds the family line.'],
      ['Birth weight', 'Weigh or weigh-band the calf at birth if possible.'],
      ['Dead at birth', 'Still record the calving, then mark the calf as died the same day.'],
    ],
  },
  {
    title: '3. Weights — the most useful record for beef and heifers',
    why: 'Without weights FarmOS can only use breed averages. With them it spots slow growers and tells you exactly when heifers are ready and steers reach sale weight.',
    items: [
      ['When', 'At birth, at weaning (about 7–8 months), then every 3 months until 2 years old, and before any sale.'],
      ['How', 'A scale is best; a weigh band (heart girth tape) is fine. Use the same method each time.'],
      ['Record', 'Animal → Weight. The profile then shows grams gained per day against what is expected.'],
    ],
  },
  {
    title: '4. Breeding',
    why: 'Gives calving dates, heat watch and readiness reminders.',
    items: [
      ['Heats seen', 'Record the date. FarmOS watches for the next heat 21 days later.'],
      ['Service / AI', 'Date, AI or bull, bull tag or semen code.'],
      ['Bull in with a group', 'Record the date the bull goes in and comes out, and which animals were in the group (record a service for each, method: bull).'],
      ['Pregnancy diagnosis', 'Have the vet check 60–90 days after service and record pregnant / not pregnant.'],
      ['Heifers', 'Serve when FarmOS shows “Ready to serve” — both old enough and heavy enough (about 60% of grown-cow weight).'],
    ],
  },
  {
    title: '5. Milk',
    why: 'Shows each cow’s yield against what she should give for her breed, feeding and stage of lactation.',
    items: [
      ['Every milking', 'Record per cow if you can. If not, record the herd total and FarmOS shares it out.'],
      ['Weekly test day', 'At least once a week, measure each cow separately, morning and evening. This is what makes the per-cow forecast accurate.'],
      ['Dry-off', 'Record the date each cow is dried off.'],
    ],
  },
  {
    title: '6. Feeding',
    why: 'Feeding changes how fast animals grow and how much milk cows give.',
    items: [
      ['Feeding type per group', 'Set it on the animal or in Settings: grazing only, grazing + supplements, or zero-grazing.'],
      ['Groups / paddocks', 'Keep each animal’s group up to date (milking herd, heifers, steers, calves).'],
      ['Supplements bought and used', 'Record in Feed: purchases and daily use of dairy meal, bran, minerals, hay.'],
    ],
  },
  {
    title: '7. Health',
    why: 'Shows which animals need attention, milk withdrawal, and treatment costs.',
    items: [
      ['Tick control', 'Each spraying or dipping, for the whole group, with the product and the next due date.'],
      ['Vaccines', 'FMD, lumpy skin, brucellosis (heifer calves), anthrax/blackleg — date, vaccine, next due date.'],
      ['Deworming', 'Product and next due date (usually every 3 months for young stock).'],
      ['Sickness', 'Problem, drug, dose, withdrawal days, cost. Mark recovered when better.'],
    ],
  },
  {
    title: '8. Animals leaving',
    why: 'Keeps the herd count right and puts sales into Money.',
    items: [
      ['Sold', 'Date, buyer, price, and weight if known.'],
      ['Died', 'Date and cause as best known.'],
      ['Culled / slaughtered', 'Date and reason.'],
    ],
  },
  {
    title: '9. End of every month',
    why: 'Makes sure records and reality agree.',
    items: [
      ['Head count', 'Count every class and record the month in the Herd register.'],
      ['Check the comparison', 'Register → “Animal records vs register”. Any difference means a birth, death, sale or tagging was missed.'],
      ['Download the monthly report', 'Reports → Monthly → PDF or Excel, for the diocese office.'],
    ],
  },
];

export default function Guide() {
  return (
    <div className="stack" style={{ gap: 22, maxWidth: 760 }}>
      <div className="page-head"><div><h1>What to record</h1><p>For ranch staff: the records FarmOS needs to track every animal well.</p></div></div>
      {GUIDE.map((s) => (
        <section key={s.title} className="section">
          <h2>{s.title}</h2>
          <p className="small muted">{s.why}</p>
          <div className="list">
            {s.items.map(([k, v]) => <div key={k} className="item"><div className="main"><div className="title">{k}</div><div className="sub" style={{ whiteSpace: 'normal' }}>{v}</div></div></div>)}
          </div>
        </section>
      ))}
      <p className="small muted">Start with tags, births and the monthly count. Add weights and the weekly milk test next — they make the forecasts sharp. <Link to="/register">Herd register</Link></p>
    </div>
  );
}
