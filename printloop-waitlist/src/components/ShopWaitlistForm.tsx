import { useState } from 'react';
import type { ShopWaitlistData } from '../types/waitlist';
import { LOCATION_OPTIONS, OS_OPTIONS, INTERNET_OPTIONS } from '../types/waitlist';
import { formatWhatsAppNumber, validateShopWaitlist } from '../utils/validation';
import { submitWaitlist } from '../utils/api';

const STEPS = [
  { key: 'details', label: 'Shop', fields: ['shopName', 'ownerName', 'whatsappNumber'] },
  { key: 'equipment', label: 'Setup', fields: ['location', 'printerModels', 'computerOS', 'internetType'] },
  { key: 'operations', label: 'Operations', fields: ['dailyVolume', 'pricePerPage', 'operatingHours', 'whyJoin'] },
  { key: 'review', label: 'Review', fields: [] },
];

export function ShopWaitlistForm() {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState<Partial<ShopWaitlistData>>({ type: 'shop' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ position?: number; isEarlyBird?: boolean } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateCurrentStep = (): boolean => {
    const step = STEPS[activeStep];
    const stepErrors: Record<string, string> = {};
    
    step.fields.forEach(field => {
      const error = validateShopWaitlist({ ...formData, [field]: formData[field as keyof ShopWaitlistData] })[field];
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
    
    const allErrors = validateShopWaitlist(formData);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      setActiveStep(STEPS.findIndex(s => s.fields.some(f => allErrors[f])));
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await submitWaitlist(formData as ShopWaitlistData);
      setSubmitResult({ position: response.position, isEarlyBird: response.isEarlyBird });
      setIsSubmitted(true);
      setIsSubmitting(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof ShopWaitlistData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleWhatsAppChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField('whatsappNumber', formatWhatsAppNumber(e.target.value));
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
        <h3 className="form__success-title">Application received</h3>
        <p className="form__success-desc">
          {submitResult.isEarlyBird
            ? `You're in the first 5 pilot shops. <strong>Month 1 = 0% platform fees.</strong> We'll WhatsApp you within 24 hours to schedule onboarding.`
            : `You're applicant #${submitResult.position || '—'}. We'll review and WhatsApp you within 48 hours.`
          }
        </p>
        <button
          type="button"
          className="btn btn--ghost mt-3"
          onClick={() => { setIsSubmitted(false); setFormData({ type: 'shop' }); setActiveStep(0); }}
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
        <div key={step.key} className={`form__step ${i === activeStep ? 'form__step--active' : ''}`} role="tabpanel" aria-labelledby={`shop-step-${i}`}>
          {i === 0 && (
            <>
              <h3 id="shop-step-0" className="display-sm" style={{ marginBottom: 'var(--space-md)' }}>Shop details</h3>
              <div className="form__grid">
                <div className="field">
                  <label htmlFor="shopName" className="field__label">Shop name</label>
                  <input
                    type="text"
                    id="shopName"
                    className={`field__input ${errors.shopName ? 'field__input--error' : ''}`}
                    value={formData.shopName || ''}
                    onChange={e => updateField('shopName', e.target.value)}
                    placeholder="e.g., Campus Print Hub"
                    required
                    disabled={isSubmitting}
                  />
                  {errors.shopName && <span className="field__error">{errors.shopName}</span>}
                </div>

                <div className="field">
                  <label htmlFor="ownerName" className="field__label">Owner name</label>
                  <input
                    type="text"
                    id="ownerName"
                    className={`field__input ${errors.ownerName ? 'field__input--error' : ''}`}
                    value={formData.ownerName || ''}
                    onChange={e => updateField('ownerName', e.target.value)}
                    placeholder="Your name"
                    required
                    disabled={isSubmitting}
                  />
                  {errors.ownerName && <span className="field__error">{errors.ownerName}</span>}
                </div>

                <div className="field">
                  <label htmlFor="shopWhatsApp" className="field__label">WhatsApp number</label>
                  <input
                    type="tel"
                    id="shopWhatsApp"
                    className={`field__input ${errors.whatsappNumber ? 'field__input--error' : ''}`}
                    value={formData.whatsappNumber || ''}
                    onChange={handleWhatsAppChange}
                    placeholder="+234 801 234 5678"
                    required
                    disabled={isSubmitting}
                  />
                  {errors.whatsappNumber && <span className="field__error">{errors.whatsappNumber}</span>}
                  <span className="field__hint">For onboarding & weekly payout notifications</span>
                </div>
              </div>
            </>
          )}

          {i === 1 && (
            <>
              <h3 id="shop-step-1" className="display-sm" style={{ marginBottom: 'var(--space-md)' }}>Equipment & setup</h3>
              <div className="form__grid">
                <div className="field">
                  <label htmlFor="location" className="field__label">Shop location</label>
                  <select
                    id="location"
                    className={`field__select ${errors.location ? 'field__select--error' : ''}`}
                    value={formData.location || ''}
                    onChange={e => updateField('location', e.target.value)}
                    required
                    disabled={isSubmitting}
                  >
                    <option value="">Select location</option>
                    {LOCATION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {errors.location && <span className="field__error">{errors.location}</span>}
                </div>

                <div className="field">
                  <label htmlFor="printerModels" className="field__label">Printer model(s)</label>
                  <textarea
                    id="printerModels"
                    className={`field__textarea ${errors.printerModels ? 'field__textarea--error' : ''}`}
                    value={formData.printerModels || ''}
                    onChange={e => updateField('printerModels', e.target.value)}
                    placeholder="e.g., HP LaserJet Pro M404, Canon imageRUNNER 2525"
                    rows={3}
                    required
                    disabled={isSubmitting}
                  />
                  {errors.printerModels && <span className="field__error">{errors.printerModels}</span>}
                  <span className="field__hint">List all printers. Any brand works with PrintLoop.</span>
                </div>

                <div className="field">
                  <label htmlFor="computerOS" className="field__label">Computer OS</label>
                  <select
                    id="computerOS"
                    className={`field__select ${errors.computerOS ? 'field__select--error' : ''}`}
                    value={formData.computerOS || ''}
                    onChange={e => updateField('computerOS', e.target.value)}
                    required
                    disabled={isSubmitting}
                  >
                    <option value="">Select OS</option>
                    {OS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {errors.computerOS && <span className="field__error">{errors.computerOS}</span>}
                </div>

                <div className="field">
                  <label htmlFor="internetType" className="field__label">Internet connection</label>
                  <select
                    id="internetType"
                    className={`field__select ${errors.internetType ? 'field__select--error' : ''}`}
                    value={formData.internetType || ''}
                    onChange={e => updateField('internetType', e.target.value)}
                    required
                    disabled={isSubmitting}
                  >
                    <option value="">Select internet type</option>
                    {INTERNET_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {errors.internetType && <span className="field__error">{errors.internetType}</span>}
                </div>
              </div>
            </>
          )}

          {i === 2 && (
            <>
              <h3 id="shop-step-2" className="display-sm" style={{ marginBottom: 'var(--space-md)' }}>Operations & pricing</h3>
              <div className="form__grid">
                <div className="field">
                  <label htmlFor="dailyVolume" className="field__label">Current daily volume (pages)</label>
                  <input
                    type="number"
                    id="dailyVolume"
                    className={`field__input ${errors.dailyVolume ? 'field__input--error' : ''}`}
                    value={formData.dailyVolume || ''}
                    onChange={e => updateField('dailyVolume', parseInt(e.target.value) || 0)}
                    placeholder="e.g., 200"
                    min="0"
                    required
                    disabled={isSubmitting}
                  />
                  {errors.dailyVolume && <span className="field__error">{errors.dailyVolume}</span>}
                </div>

                <div className="field">
                  <label htmlFor="pricePerPage" className="field__label">Your price per page (₦)</label>
                  <input
                    type="number"
                    id="pricePerPage"
                    className={`field__input ${errors.pricePerPage ? 'field__input--error' : ''}`}
                    value={formData.pricePerPage || ''}
                    onChange={e => updateField('pricePerPage', parseInt(e.target.value) || 0)}
                    placeholder="e.g., 30"
                    min="0"
                    required
                    disabled={isSubmitting}
                  />
                  {errors.pricePerPage && <span className="field__error">{errors.pricePerPage}</span>}
                  <span className="field__hint"><strong>You set your price.</strong> Students see it before choosing your shop.</span>
                </div>

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="operatingHours" className="field__label">Operating hours</label>
                  <input
                    type="text"
                    id="operatingHours"
                    className={`field__input ${errors.operatingHours ? 'field__input--error' : ''}`}
                    value={formData.operatingHours || ''}
                    onChange={e => updateField('operatingHours', e.target.value)}
                    placeholder="e.g., Mon-Fri 8am-8pm, Sat 9am-2pm, Sun Closed"
                    required
                    disabled={isSubmitting}
                  />
                  {errors.operatingHours && <span className="field__error">{errors.operatingHours}</span>}
                </div>

                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="whyJoin" className="field__label">Why join PrintLoop? (optional)</label>
                  <textarea
                    id="whyJoin"
                    className="field__textarea"
                    value={formData.whyJoin || ''}
                    onChange={e => updateField('whyJoin', e.target.value)}
                    placeholder="What are you hoping to achieve? More customers? Less idle time? Better payments?"
                    rows={4}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </>
          )}

          {i === 3 && (
            <>
              <h3 id="shop-step-3" className="display-sm" style={{ marginBottom: 'var(--space-md)' }}>Review & submit</h3>
              
              <div className="form__review">
                <div className="form__review-title">Shop details</div>
                <dl className="form__review-grid">
                  <dt className="form__review-label">Shop name</dt><dd className="form__review-value">{formData.shopName || '—'}</dd>
                  <dt className="form__review-label">Owner</dt><dd className="form__review-value">{formData.ownerName || '—'}</dd>
                  <dt className="form__review-label">WhatsApp</dt><dd className="form__review-value">{formData.whatsappNumber || '—'}</dd>
                </dl>
              </div>

              <div className="form__review">
                <div className="form__review-title">Equipment</div>
                <dl className="form__review-grid">
                  <dt className="form__review-label">Location</dt><dd className="form__review-value">{LOCATION_OPTIONS.find(l => l.value === formData.location)?.label || '—'}</dd>
                  <dt className="form__review-label">Printers</dt><dd className="form__review-value">{formData.printerModels || '—'}</dd>
                  <dt className="form__review-label">Computer OS</dt><dd className="form__review-value">{OS_OPTIONS.find(o => o.value === formData.computerOS)?.label || '—'}</dd>
                  <dt className="form__review-label">Internet</dt><dd className="form__review-value">{INTERNET_OPTIONS.find(i => i.value === formData.internetType)?.label || '—'}</dd>
                </dl>
              </div>

              <div className="form__review">
                <div className="form__review-title">Operations</div>
                <dl className="form__review-grid">
                  <dt className="form__review-label">Daily volume</dt><dd className="form__review-value">{formData.dailyVolume ? `${formData.dailyVolume} pages` : '—'}</dd>
                  <dt className="form__review-label">Your price/page</dt><dd className="form__review-value">{formData.pricePerPage ? `₦${formData.pricePerPage}` : '—'}</dd>
                  <dt className="form__review-label">Hours</dt><dd className="form__review-value">{formData.operatingHours || '—'}</dd>
                </dl>
              </div>

              <div className="form__early-bird form__early-bird--shops">
                <div className="form__early-bird-icon">
                  <div className="badge badge--stock">Pilot</div>
                </div>
                <div className="form__early-bird-text">
                  <strong>Pilot program:</strong> First 5 shops get <strong>Month 1 = 0% platform fees</strong>. You keep 100% of PrintLoop revenue.
                </div>
              </div>

              <div className="form__early-bird form__early-bird--shops">
                <div className="form__early-bird-icon">
                  <div className="badge badge--toner">You set prices</div>
                </div>
                <div className="form__early-bird-text">
                  <strong>Your shop, your price.</strong> Students see your ₦/page before choosing you. PrintLoop takes 10-15% after Month 1.
                </div>
              </div>

              <p className="field__hint" style={{ textAlign: 'center', display: 'block' }}>
                By submitting, you agree to be contacted for pilot onboarding. No commitment until you're ready.
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
          <button type="button" className="btn btn--stock" onClick={handleNext} disabled={isSubmitting}>
            Next
          </button>
        ) : (
          <button type="submit" className="btn btn--stock btn--lg btn--full" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting application…' : 'Apply for pilot spot'}
          </button>
        )}
      </div>
    </form>
  );
}