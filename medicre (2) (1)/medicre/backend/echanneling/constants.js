const SERVICE_FEES = {
  OPD: 1500,
  Psychiatric: 3000,
  Physiotherapy: 2500,
  Counselling: 2200,
  Aesthetic: 4000,
  'Lab Testing': 1800
};

const DOCTORS = [
  { name: 'Dr. Asanka Weerasinghe', spec: 'Internal Medicine' },
  { name: 'Dr. A. Perera', spec: 'General Physician' },
  { name: 'Dr. N. Silva', spec: 'Psychiatrist' },
  { name: 'Dr. S. Jayasinghe', spec: 'Physiotherapist' },
  { name: 'Dr. R. Fernando', spec: 'Dermatology / Aesthetic' },
  { name: 'Dr. M. Kumara', spec: 'Counsellor' },
  { name: 'Dr. K. Wijesuriya', spec: 'Lab Consultant' }
];

module.exports = {
  SERVICE_FEES,
  DOCTORS
};
