import { useState, useCallback } from 'react';
import type { WaitlistData, FormState } from '../types/waitlist';
import { validateWaitlist } from '../utils/validation';
import { submitWaitlist } from '../utils/api';

interface UseWaitlistFormOptions<T extends WaitlistData> {
  initialData?: Partial<T>;
  onSuccess?: (response: { position?: number; isEarlyBird?: boolean; discountPercent?: number }) => void;
  onError?: (error: string) => void;
}

export function useWaitlistForm<T extends WaitlistData>({
  initialData = {},
  onSuccess,
  onError,
}: UseWaitlistFormOptions<T> = {}) {
  const [state, setState] = useState<FormState<T>>({
    data: initialData as Partial<T>,
    errors: {},
    isSubmitting: false,
    isSubmitted: false,
  });

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setState(prev => ({
      ...prev,
      data: { ...prev.data, [field]: value },
      errors: { ...prev.errors, [field]: '' },
    }));
  }, []);

  const updateMultipleFields = useCallback((fields: Partial<T>) => {
    setState(prev => ({
      ...prev,
      data: { ...prev.data, ...fields },
    }));
  }, []);

  const setFieldError = useCallback((field: string, error: string) => {
    setState(prev => ({
      ...prev,
      errors: { ...prev.errors, [field]: error },
    }));
  }, []);

  const clearErrors = useCallback(() => {
    setState(prev => ({ ...prev, errors: {} }));
  }, []);

  const validate = useCallback((): boolean => {
    const errors = validateWaitlist(state.data);
    setState(prev => ({ ...prev, errors }));
    return Object.keys(errors).length === 0;
  }, [state.data]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setState(prev => ({ ...prev, isSubmitting: true, submitError: undefined }));

    try {
      const response = await submitWaitlist(state.data as unknown as WaitlistData);
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        isSubmitted: true,
      }));
      onSuccess?.({
        position: response.position,
        isEarlyBird: response.isEarlyBird,
        discountPercent: response.discountPercent,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        submitError: message,
      }));
      onError?.(message);
    }
  }, [state.data, validate, onSuccess, onError]);

  const reset = useCallback(() => {
    setState({
      data: initialData as Partial<T>,
      errors: {},
      isSubmitting: false,
      isSubmitted: false,
    });
  }, [initialData]);

  return {
    ...state,
    updateField,
    updateMultipleFields,
    setFieldError,
    clearErrors,
    validate,
    handleSubmit,
    reset,
  };
}