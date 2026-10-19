import { ONBOARDING_STEPS, type Onboarding, type OnboardingStep } from '@verifiq/domain';
import { Icon } from './icons';

/** The wizard: the onboarding steps, then signing the Representation (its own page). */
const WIZARD_STEPS = [...ONBOARDING_STEPS, 'representation'] as const;

type WizardStep = (typeof WIZARD_STEPS)[number];

const STEP_LABELS: Record<WizardStep, string> = {
  'fiscal-data': 'Tus datos',
  defaults: 'Impuestos',
  series: 'Numeración',
  terms: 'Condiciones',
  representation: 'Autorización',
};

export function Stepper({
  current,
  reached,
  onSelect,
}: {
  current: WizardStep;
  reached: Onboarding['step'];
  /** Without it, done steps are not links. */
  onSelect?: (step: OnboardingStep) => void;
}) {
  const index = WIZARD_STEPS.indexOf(current);
  const reachedIndex = reached === 'completed' ? ONBOARDING_STEPS.length : ONBOARDING_STEPS.indexOf(reached);
  return (
    <ol className="steps" aria-label="Pasos del alta">
      {WIZARD_STEPS.map((step, i) => {
        const className = `step${i < reachedIndex && i !== index ? ' done' : ''}${i === index ? ' on' : ''}`;
        const content = (
          <>
            <span className="n">{i < reachedIndex && i !== index ? <Icon name="check" /> : i + 1}</span>
            {STEP_LABELS[step]}
          </>
        );
        return (
          <li key={step} aria-current={i === index ? 'step' : undefined}>
            {onSelect && step !== 'representation' && i <= reachedIndex && i !== index ? (
              <button type="button" className={className} onClick={() => onSelect(step)}>
                {content}
              </button>
            ) : (
              <span className={className}>{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
