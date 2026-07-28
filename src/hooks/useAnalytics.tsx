import { useEffect } from "react";
import mixpanel from "mixpanel-browser";
import useAppState from "./useAppState";

let analyticsReady = false;

function useAnalytics() {
  const isDevelopment = process.env.APP_ENV === "development";
  const { userId } = useAppState();
  const projectToken =
    process.env.NEXT_PUBLIC_MIXPANEL_PROJECT_TOKEN ||
    process.env.MIXPANEL_PROJECT_TOKEN ||
    "";

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
          $app: process.env.APP_NAME,
        });
      }
    } catch (error) {
      analyticsReady = false;
      if (isDevelopment) {
        console.warn("Mixpanel initialization skipped", error);
      }
    }
  }, [isDevelopment, projectToken, userId]);

  function trackEvent(eventName: string, tags: Record<string, string> = {}) {
    const allTags = {
      enviroment: process.env.APP_ENV,
      app: process.env.APP_NAME,
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
