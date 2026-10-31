import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogContent,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/lib/supabase';
import * as Sentry from '@sentry/react';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import posthog from 'posthog-js';
import { apiJson } from '@/services/api';
import { useT } from '@/i18n';

type CancellationFeedback =
  | 'customer_service'
  | 'low_quality'
  | 'missing_features'
  | 'other'
  | 'switched_service'
  | 'too_complex'
  | 'too_expensive'
  | 'unused';

export const DeleteAccountDialog = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [confirmText, setConfirmText] = useState('');
  const { toast } = useToast();
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedReason, setSelectedReason] =
    useState<CancellationFeedback | null>(null);
  const { mutate: deleteUser, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      posthog.capture('delete_account_called', {
        reason: selectedReason,
      });
      await apiJson('delete-user', {
        method: 'POST',
        body: JSON.stringify({ reason: selectedReason }),
      });
    },
    onSuccess: () => {
      // Sign out locally and redirect after deletion
      supabase.auth.signOut();
    },
    onError: (error) => {
      Sentry.captureException(error);
      toast({
        title: t.deleteAccount.failedTitle,
        description: t.deleteAccount.failedDesc,
        variant: 'destructive',
      });
    },
  });

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-md rounded-3xl">
        {step === 1 ? (
          <div className="flex flex-col gap-16">
            <AlertDialogHeader className="text-center sm:text-center">
              <AlertDialogTitle className="w-full">
                {t.deleteAccount.sadTitle}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="flex flex-col gap-6">
              <div className="text-sm">{t.deleteAccount.whyLeaving}</div>
              <RadioGroup
                value={selectedReason}
                className="flex flex-col gap-6"
              >
                <label className="flex items-center gap-3 text-sm">
                  <RadioGroupItem
                    onClick={() => setSelectedReason('too_expensive')}
                    value="too_expensive"
                  />
                  {t.deleteAccount.tooExpensive}
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <RadioGroupItem
                    onClick={() => setSelectedReason('missing_features')}
                    value="missing_features"
                  />
                  {t.deleteAccount.missingFeatures}
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <RadioGroupItem
                    onClick={() => setSelectedReason('low_quality')}
                    value="low_quality"
                  />
                  {t.deleteAccount.lowQuality}
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <RadioGroupItem
                    onClick={() => setSelectedReason('unused')}
                    value="unused"
                  />
                  {t.deleteAccount.unused}
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <RadioGroupItem
                    onClick={() => setSelectedReason('switched_service')}
                    value="switched_service"
                  />
                  {t.deleteAccount.switched}
                </label>
              </RadioGroup>
            </div>
            <div className="grid w-full grid-cols-2 gap-5">
              <Button
                variant="secondary"
                className="w-full rounded-full"
                onClick={() => {
                  setIsOpen(false);
                  setConfirmText('');
                  setSelectedReason(null);
                  setStep(1);
                }}
              >
                {t.common.cancel}
              </Button>
              <Button
                variant="black"
                className="w-full rounded-full"
                onClick={() => setStep(2)}
                disabled={!selectedReason}
              >
                {t.common.next}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-16">
            <AlertDialogHeader className="text-center sm:text-center">
              <AlertDialogTitle className="w-full">
                {t.deleteAccount.areYouSure}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-4">
              <p>{t.deleteAccount.means}</p>
              <div className="rounded-lg bg-adam-neutral-950 p-4 text-adam-neutral-100">
                <ul className="list-disc space-y-2 ps-5 text-sm">
                  <li>{t.deleteAccount.permanent}</li>
                  <li>{t.deleteAccount.dataRetention}</li>
                </ul>
              </div>
            </div>
            <div className="space-y-2">
              <p>
                {t.deleteAccount.typeToConfirmBefore}{' '}
                <span className="font-semibold text-red-500">
                  {t.deleteAccount.confirmWord}
                </span>{' '}
                {t.deleteAccount.typeToConfirmAfter}
              </p>
              <Input
                className="rounded-none border-x-0 border-b border-t-0 border-adam-neutral-200 shadow-none ring-0 focus:border-adam-neutral-200 focus:ring-0"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={t.deleteAccount.confirmWord}
              />
            </div>
            <div className="grid w-full grid-cols-2 gap-5">
              <Button
                variant="secondary"
                className="w-full rounded-full"
                onClick={() => {
                  setIsOpen(false);
                  setConfirmText('');
                  setSelectedReason(null);
                  setStep(1);
                }}
              >
                {t.common.cancel}
              </Button>
              <Button
                variant="destructive"
                className="w-full rounded-full"
                disabled={
                  confirmText.trim() !== t.deleteAccount.confirmWord ||
                  isDeleting
                }
                onClick={() => deleteUser()}
              >
                {t.deleteAccount.confirmWord}
              </Button>
            </div>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};
