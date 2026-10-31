import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProfile, useUpdateProfile } from '@/services/profileService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/i18n';

interface NotificationPromptProps {
  shouldShow?: boolean;
  onDismiss?: () => void;
}

export function NotificationPrompt({
  shouldShow = true,
  onDismiss,
}: NotificationPromptProps) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { mutate: updateProfile } = useUpdateProfile();
  const { toast } = useToast();
  const t = useT();
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const handleEnableNotifications = async () => {
    setIsEnablingNotifications(true);

    try {
      // First request browser permission
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
          // Update profile to enable notifications
          updateProfile(
            { notifications_enabled: true },
            {
              onSuccess: () => {
                toast({
                  title: t.notify.enabled,
                  description: t.notify.enabledDesc,
                });
                handleDismiss();
              },
              onError: () => {
                toast({
                  title: t.common.error,
                  description: t.notify.enableFailed,
                  variant: 'destructive',
                });
              },
            },
          );
        } else {
          toast({
            title: t.notify.denied,
            description: t.notify.deniedDesc,
            variant: 'destructive',
          });
          handleDismiss();
        }
      } else {
        toast({
          title: t.notify.unsupported,
          description: t.notify.unsupportedDesc,
          variant: 'destructive',
        });
        handleDismiss();
      }
    } finally {
      setIsEnablingNotifications(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  // Don't show if conditions aren't met
  if (
    !shouldShow ||
    isDismissed ||
    !user ||
    !profile ||
    profile.notifications_enabled
  ) {
    return null;
  }

  return (
    <div className="absolute top-4 z-10 mx-4 duration-500 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-3 rounded-full border border-adam-neutral-700/50 bg-adam-neutral-800/95 py-2 pe-3 ps-4 shadow-lg backdrop-blur-sm">
        <Bell className="h-4 w-4 text-adam-neutral-100" />
        <span className="text-sm text-adam-neutral-100">{t.notify.prompt}</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="adam_dark"
            className="h-7 rounded-full px-3 text-xs text-adam-neutral-100"
            onClick={handleDismiss}
            disabled={isEnablingNotifications}
          >
            {t.notify.notNow}
          </Button>
          <Button
            size="sm"
            variant="light"
            className="h-7 rounded-full px-3 text-xs"
            onClick={handleEnableNotifications}
            disabled={isEnablingNotifications}
          >
            {isEnablingNotifications ? t.notify.enabling : t.notify.enable}
          </Button>
        </div>
      </div>
    </div>
  );
}
