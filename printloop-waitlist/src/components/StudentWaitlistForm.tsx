import { useState } from 'react';
import type { StudentWaitlistData } from '../types/waitlist';
import { FACULTY_OPTIONS, LEVEL_OPTIONS, PRINT_METHOD_OPTIONS, PRINTS_MOST_OPTIONS } from '../types/waitlist';
import { formatWhatsAppNumber, validateStudentWaitlist } from '../utils/validation';
import { submitWaitlist } from '../utils/api';

const STEPS = [
  { key: 'details', label: 'Details', fields: ['fullName', 'whatsappNumber', 'email', 'hostelArea'] },
  { key: 'academic', label: 'Academic', fields: ['faculty', 'level'] },
  { key: 'habits', label: 'Printing', fields: ['printsMost', 'currentPrintMethod'] },
  { key: 'review', label: 'Review', fields: [] },
];

export function StudentWaitlistForm() {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState<Partial<StudentWaitlistData>>({
    type: 'student',
    printsMost: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ position?: number; isEarlyBird?: boolean } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateCurrentStep = (): boolean => {
    const step = STEPS[activeStep];
    const stepErrors: Record<string, string> = {};
    
    step.fields.forEach(field => {
      const error = validateStudentWaitlist({ ...formData, [field]: formData[field as keyof StudentWaitlistData] })[field];
      if (error) stepErrors[field] = error;
    });

    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setActiveStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setActiveStep(prev => Math.max(prev - 1, 0));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const allErrors = validateStudentWaitlist(formData);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      setActiveStep(STEPS.findIndex(s => s.fields.some(f => allErrors[f])));
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await submitWaitlist(formData as StudentWaitlistData);
      setSubmitResult({ position: response.position, isEarlyBird: response.isEarlyBird });
      setIsSubmitted(true);
      setIsSubmitting(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof StudentWaitlistData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleWhatsAppChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField('whatsappNumber', formatWhatsAppNumber(e.target.value));
  };

  const handleCheckboxChange = (value: string, checked: boolean) => {
    const current = formData.printsMost || [];
    updateField('printsMost', checked ? [...current, value] : current.filter(v => v !== value));
  };

  const getProgressClass = (stepIndex: number) => {
    if (stepIndex < activeStep) return 'form__progress-step form__progress-step--complete';
    if (stepIndex === activeStep) return 'form__progress-step form__progress-step--active';
    return 'form__progress-step';
  };

  if (isSubmitted && submitResult) {
    return (
      <div className="form__success" role="status">
        <div className="form__success-icon" aria-hidden="true">✓</div>
        <h3 className="form__success-title">You're on the list</h3>
        <p className="form__success-desc">
          {submitResult.isEarlyBird
            ? `You're in the first 200. <strong>20% off your first 3 prints</strong> is locked in.`
            : `You're position #${submitResult.position || '—'} on the student waitlist.`
          }
        </p>
        <p className="form__success-desc" style={{ marginTop: 'var(--space-md)', fontSize: 'var(--body-sm)' }}>
          We'll WhatsApp you when PrintLoop launches at UniAbuja.
        </p>
        <button
          type="button"
          className="btn btn--ghost mt-3"
          onClick={() => { setIsSubmitted(false); setFormData({ type: 'student', printsMost: [] }); setActiveStep(0); }}
        >
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="waitlist-form" noValidate>
      <div className="form__progress" role="progressbar" aria-valuenow={activeStep + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
        {STEPS.map((step, i) => (
          <div key={step.key} className={getProgressClass(i)}>
            <div className="form__progress-dot">{i + 1}</div>
            <span className="form__progress-label">{step.label}</span>
          </div>
        ))}
      </div>

      {submitError && <div className="form__error" role="alert">{submitError}</div>}

      {STEPS.map((step, i) => (
        <div key={step.key} className={`form__step ${i === activeStep ? 'form__step--active' : ''}`} role="tabpanel" aria-labelledby={`step-${i}`}>
          {i === 0 && (
            <>
              <h3 id="step-0" className="display-sm" style={{ marginBottom: 'var(--space-md)' }}>Your details</h3>
              <div className="form__grid">
                <div className="field">
                  <label htmlFor="fullName" className="field__label">Full name</label>
                  <input
                    type="text"
                    id="fullName"
                    className={`field__input ${errors.fullName ? 'field__input--error' : ''}`}
                    value={formData.fullName || ''}
                    onChange={e => updateField('fullName', e.target.value)}
                    placeholder="John Doe"
                    autoComplete="name"
                    required
                    disabled={isSubmitting}
                  />
                  {errors.fullName && <span className="field__error">{errors.fullName}</span>}
                </div>

                <div className="field">
                  <label htmlFor="whatsappNumber" className="field__label">WhatsApp number</label>
                  <input
                    type="tel"
                    id="whatsappNumber"
                    className={`field__input ${errors.whatsappNumber ? 'field__input--error' : ''}`}
                    value={formData.whatsappNumber || ''}
                    onChange={handleWhatsAppChange}
                    placeholder="+234 801 234 5678"
                    autoComplete="tel"
                    required
                    disabled={isSubmitting}
                  />
                  {errors.whatsappNumber && <span className="field__error">{errors.whatsappNumber}</span>}
                  <span className="field__hint">We'll send launch updates via WhatsApp</span>
                </div>

                <div className="field">
                  <label htmlFor="email" className="field__label">Email (optional)</label>
                  <input
                    type="email"
                    id="email"
                    className={`field__input ${errors.email ? 'field__input--error' : ''}`}
                    value={formData.email || ''}
                    onChange={e => updateField('email', e.target.value)}
                    placeholder="john@student.uniabuja.edu.ng"
                    autoComplete="email"
                    disabled={isSubmitting}
                  />
                  {errors.email && <span className="field__error">{errors.email}</span>}
                </div>

                <div className="field">
                  <label htmlFor="hostelArea" className="field__label">Hostel / area (optional)</label>
                  <input
                    type="text"
                    id="hostelArea"
                    className="field__input"
                    value={formData.hostelArea || ''}
                    onChange={e => updateField('hostelArea', e.target.value)}
                    placeholder="e.g., Main Campus Hostel, Gwagwalada, Kubwa"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </>
          )}

          {i === 1 && (
            <>
              <h3 id="step-1" className="display-sm" style={{ marginBottom: 'var(--space-md)' }}>Academic info</h3>
              <div className="form__grid">
                <div className="field">
                  <label htmlFor="faculty" className="field__label">Faculty</label>
                  <select
                    id="faculty"
                    className={`field__select ${errors.faculty ? 'field__select--error' : ''}`}
                    value={formData.faculty || ''}
                    onChange={e => updateField('faculty', e.target.value)}
                    required
                    disabled={isSubmitting}
                  >
                    <option value="">Select faculty</option>
                    {FACULTY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {errors.faculty && <span className="field__error">{errors.faculty}</span>}
                </div>

                <div className="field">
                  <label htmlFor="level" className="field__label">Level</label>
                  <select
                    id="level"
                    className={`field__select ${errors.level ? 'field__select--error' : ''}`}
                    value={formData.level || ''}
                    onChange={e => updateField('level', e.target.value)}
                    required
                    disabled={isSubmitting}
                  >
                    <option value="">Select level</option>
                    {LEVEL_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {errors.level && <span className="field__error">{errors.level}</span>}
                </div>
              </div>
            </>
          )}

          {i === 2 && (
            <>
              <h3 id="step-2" className="display-sm" style={{ marginBottom: 'var(--space-md)' }}>Your printing habits</h3>
              
              <div className="field">
                <label className="field__label">What do you print most?</label>
                <div className="checkbox-group" role="group" aria-label="Print types">
                  {PRINTS_MOST_OPTIONS.map(opt => (
                    <label key={opt.value} className="checkbox-option">
                      <input
                        type="checkbox"
                        name="printsMost"
                        value={opt.value}
                        checked={formData.printsMost?.includes(opt.value) || false}
                        onChange={e => handleCheckboxChange(opt.value, e.target.checked)}
                        disabled={isSubmitting}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                {errors.printsMost && <span className="field__error">{errors.printsMost}</span>}
              </div>

              <div className="field">
                <label htmlFor="currentPrintMethod" className="field__label">How do you print today?</label>
                <select
                  id="currentPrintMethod"
                  className={`field__select ${errors.currentPrintMethod ? 'field__select--error' : ''}`}
                  value={formData.currentPrintMethod || ''}
                  onChange={e => updateField('currentPrintMethod', e.target.value)}
                  required
                  disabled={isSubmitting}
                >
                  <option value="">Select current method</option>
                  {PRINT_METHOD_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {errors.currentPrintMethod && <span className="field__error">{errors.currentPrintMethod}</span>}
              </div>
            </>
          )}

          {i === 3 && (
            <>
              <h3 id="step-3" className="display-sm" style={{ marginBottom: 'var(--space-md)' }}>Review & submit</h3>
              
              <div className="form__review">
                <div className="form__review-title">Your details</div>
                <dl className="form__review-grid">
                  <dt className="form__review-label">Name</dt><dd className="form__review-value">{formData.fullName || '—'}</dd>
                  <dt className="form__review-label">WhatsApp</dt><dd className="form__review-value">{formData.whatsappNumber || '—'}</dd>
                  <dt className="form__review-label">Email</dt><dd className="form__review-value">{formData.email || 'Not provided'}</dd>
                  <dt className="form__review-label">Hostel</dt><dd className="form__review-value">{formData.hostelArea || 'Not provided'}</dd>
                </dl>
              </div>

              <div className="form__review">
                <div className="form__review-title">Academic</div>
                <dl className="form__review-grid">
                  <dt className="form__review-label">Faculty</dt><dd className="form__review-value">{FACULTY_OPTIONS.find(f => f.value === formData.faculty)?.label || '—'}</dd>
                  <dt className="form__review-label">Level</dt><dd className="form__review-value">{LEVEL_OPTIONS.find(l => l.value === formData.level)?.label || '—'}</dd>
                </dl>
              </div>

              <div className="form__review">
                <div className="form__review-title">Printing</div>
                <dl className="form__review-grid">
                  <dt className="form__review-label">Prints most</dt><dd className="form__review-value">{formData.printsMost?.map(v => PRINTS_MOST_OPTIONS.find(o => o.value === v)?.label).join(', ') || '—'}</dd>
                  <dt className="form__review-label">Current method</dt><dd className="form__review-value">{PRINT_METHOD_OPTIONS.find(o => o.value === formData.currentPrintMethod)?.label || '—'}</dd>
                </dl>
              </div>

              <div className="form__early-bird">
                <div className="form__early-bird-icon">
                  <div className="counter">20%</div>
                </div>
                <div className="form__early-bird-text">
                  <strong>Early bird:</strong> First 200 students get <strong>20% off your first 3 prints</strong>.
                </div>
              </div>

              <p className="field__hint" style={{ textAlign: 'center', display: 'block' }}>
                By submitting, you agree to receive PrintLoop updates via WhatsApp. No spam. Unsubscribe anytime.
              </p>
            </>
          )}
        </div>
      ))}

      <div className="form__actions">
        {activeStep > 0 && (
          <button type="button" className="btn" onClick={handleBack} disabled={isSubmitting}>Back</button>
        )}
        {activeStep < STEPS.length - 1 ? (
          <button type="button" className="btn btn--toner" onClick={handleNext} disabled={isSubmitting}>
            Next
          </button>
        ) : (
          <button type="submit" className="btn btn--toner btn--lg btn--full" disabled={isSubmitting}>
            {isSubmitting ? 'Joining waitlist…' : 'Join waitlist — 20% off first 3 prints'}
          </button>
        )}
      </div>
    </form>
  );
}