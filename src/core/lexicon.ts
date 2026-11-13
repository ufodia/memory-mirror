/**
 * Word lists for the context-sensitive detectors. A term only counts when it
 * appears in a first-person sentence ("I", "my", "me"), so a general question
 * such as "what is diabetes?" does not become a finding about you.
 */

export const HEALTH_CONDITIONS = [
  'diabetes', 'type 1 diabetes', 'type 2 diabetes', 'prediabetes', 'hypertension', 'high blood pressure',
  'asthma', 'cancer', 'tumor', 'tumour', 'leukemia', 'lymphoma', 'chemotherapy', 'chemo', 'radiation therapy',
  'HIV', 'hepatitis', 'epilepsy', 'seizures', 'multiple sclerosis', "Crohn's", 'IBS', 'celiac', 'arthritis',
  'lupus', 'fibromyalgia', 'long COVID', 'chronic pain', 'sleep apnea', 'migraines', 'migraine', 'dementia',
  "Alzheimer's", "Parkinson's", 'heart attack', 'stroke', 'kidney disease', 'hypothyroidism', 'thyroid',
  'herpes', 'chlamydia', 'STD', 'STI', 'surgery', 'biopsy', 'MRI', 'diagnosed', 'diagnosis', 'disability',
  'allergy', 'allergies', 'anaphylaxis', 'EpiPen',
];

export const MENTAL_HEALTH = [
  'depression', 'depressed', 'anxiety', 'panic attacks', 'panic attack', 'PTSD', 'bipolar', 'schizophrenia',
  'ADHD', 'autism', 'autistic', 'OCD', 'eating disorder', 'anorexia', 'bulimia', 'insomnia', 'burnout',
  'therapy', 'therapist', 'psychiatrist', 'counselor', 'counsellor',
];

export const CRISIS = ['self-harm', 'self harm', 'suicidal', 'suicide', 'overdose', 'cutting myself'];

export const SUBSTANCE = ['addiction', 'addicted', 'alcoholism', 'alcoholic', 'relapse', 'relapsed', 'rehab', 'sober', 'sobriety'];

export const REPRODUCTIVE = [
  'pregnant', 'pregnancy', 'miscarriage', 'abortion', 'IVF', 'infertility', 'fertility treatment',
  'endometriosis', 'PCOS', 'menopause', 'egg freezing',
];

export const MEDICATIONS = [
  'sertraline', 'Zoloft', 'fluoxetine', 'Prozac', 'escitalopram', 'Lexapro', 'citalopram', 'bupropion',
  'Wellbutrin', 'venlafaxine', 'Effexor', 'duloxetine', 'Cymbalta', 'mirtazapine', 'quetiapine', 'Seroquel',
  'lithium', 'lamotrigine', 'Lamictal', 'aripiprazole', 'Abilify', 'risperidone', 'Adderall', 'Ritalin',
  'methylphenidate', 'Vyvanse', 'Concerta', 'Xanax', 'alprazolam', 'Valium', 'diazepam', 'Klonopin',
  'clonazepam', 'Ambien', 'zolpidem', 'metformin', 'insulin', 'Ozempic', 'semaglutide', 'Wegovy', 'Mounjaro',
  'tirzepatide', 'levothyroxine', 'Synthroid', 'lisinopril', 'atorvastatin', 'Lipitor', 'statins', 'prednisone',
  'PrEP', 'Truvada', 'oxycodone', 'OxyContin', 'hydrocodone', 'fentanyl', 'tramadol', 'gabapentin',
  'Suboxone', 'buprenorphine', 'methadone', 'naltrexone', 'antidepressants', 'antidepressant', 'SSRIs', 'SSRI',
  'testosterone', 'HRT', 'birth control',
];

/** Identity terms that only count in an "I am a …" or "as a …" construction. */
export const RELIGION = [
  'Muslim', 'Christian', 'Catholic', 'Protestant', 'Evangelical', 'Jewish', 'Hindu', 'Buddhist', 'Sikh',
  'Mormon', 'atheist', 'agnostic', "Jehovah's Witness",
];
export const POLITICS = [
  'Democrat', 'Republican', 'conservative', 'liberal', 'progressive', 'socialist', 'communist', 'libertarian',
  'Labour voter', 'Tory', 'Green Party member', 'leftist', 'right-winger',
];
export const ORIENTATION = [
  'gay', 'lesbian', 'bisexual', 'bi', 'pansexual', 'asexual', 'queer', 'trans', 'transgender', 'non-binary',
  'nonbinary',
];

export const IMMIGRATION = [
  'my visa', 'visa status', 'green card', 'work permit', 'residence permit', 'asylum', 'refugee status',
  'undocumented', 'deported', 'deportation', 'overstayed', 'H-1B', 'citizenship application',
];

export const LEGAL = [
  'arrested', 'convicted', 'felony', 'misdemeanor', 'DUI', 'DWI', 'probation', 'parole', 'criminal record',
  'jail', 'prison', 'lawsuit', 'sued', 'suing', 'divorce', 'custody', 'restraining order', 'my lawyer',
  'my attorney', 'union member', 'my union',
];

export const RELATIONS = [
  'wife', 'husband', 'partner', 'spouse', 'girlfriend', 'boyfriend', 'fiancé', 'fiancée', 'fiance', 'fiancee',
  'son', 'daughter', 'kid', 'kids', 'child', 'children', 'baby', 'mother', 'mom', 'mum', 'father', 'dad',
  'brother', 'sister', 'grandmother', 'grandma', 'grandfather', 'grandpa', 'aunt', 'uncle', 'cousin', 'niece',
  'nephew', 'friend', 'best friend', 'roommate', 'flatmate', 'boss', 'manager', 'coworker', 'co-worker',
  'colleague', 'neighbor', 'neighbour', 'therapist', 'doctor', 'ex', 'ex-wife', 'ex-husband', 'stepson',
  'stepdaughter', 'landlord', 'client',
];

/** Capitalized words that follow a relation but are not names ("my boss Today said …"). */
export const NOT_A_NAME = new Set([
  'I', 'A', 'An', 'The', 'And', 'But', 'Or', 'So', 'He', 'She', 'They', 'We', 'It', 'This', 'That', 'My', 'Our',
  'Your', 'His', 'Her', 'Their', 'Is', 'Was', 'Has', 'Had', 'Just', 'Also', 'Said', 'Told', 'Says', 'Today',
  'Yesterday', 'Tomorrow', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'When',
  'If', 'Then', 'Who', 'What', 'Why', 'How', 'Can', 'Could', 'Would', 'Should', 'Will', 'Does', 'Did', 'Not',
  'Never', 'Always', 'Please', 'Thanks', 'Hi', 'Hello', 'Dear', 'Mr', 'Mrs', 'Ms', 'Dr', 'Sir', 'Madam',
]);
