import { useEffect } from "react";
import mixpanel from "mixpanel-browser";
import useAppState from "./useAppState";

let analyticsReady = false;

function useAnalytics() {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV || "development";
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "gpt-clone";
  const isDevelopment = appEnv === "development";
  const { userId } = useAppState();
  const projectToken = process.env.NEXT_PUBLIC_MIXPANEL_PROJECT_TOKEN || "";

  useEffect(() => {
    if (!projectToken) return;

    try {
      if (!analyticsReady) {
        mixpanel.init(projectToken, {
          debug: isDevelopment,
          ignore_dnt: true,
        });
        analyticsReady = true;
      }

      if (userId) {
        mixpanel.identify(userId);
        mixpanel.people.set({
          $name: userId,
          $app: appName,
        });
      }
    } catch (error) {
      analyticsReady = false;
      if (isDevelopment) {
        console.warn("Mixpanel initialization skipped", error);
      }
    }
  }, [appName, isDevelopment, projectToken, userId]);

  function trackEvent(eventName: string, tags: Record<string, string> = {}) {
    const allTags = {
      enviroment: appEnv,
      app: appName,
      ...tags,
    };
    if (analyticsReady) {
      try {
        mixpanel.track(eventName, allTags);
      } catch (error) {
        if (isDevelopment) {
          console.warn("Mixpanel track skipped", error);
        }
      }
    }

    if (isDevelopment) {
      console.log("tracked", eventName, allTags);
    }
  }

  return { trackEvent };
}

export default useAnalytics;
