import 'katex/dist/katex.min.css'
import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { ZhuyinProvider } from '@/contexts/ZhuyinContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { MemoryProvider } from '@/contexts/MemoryContext'
import { CoinProvider } from '@/contexts/CoinContext'
import { ConversationProvider } from '@/contexts/ConversationContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { CardProvider } from '@/contexts/CardContext'
import { CardAnimationProvider } from '@/contexts/CardAnimationContext'
import { VideoCacheProvider } from '@/contexts/VideoCacheContext'
import CoinRewardListener from '@/components/CoinRewardListener'
import { ActivityProvider } from '@/contexts/ActivityContext'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <MemoryProvider>
        <CoinProvider>
          <CardProvider>
            <CardAnimationProvider>
            <VideoCacheProvider>
            <ConversationProvider>
              <ThemeProvider>
                <CoinRewardListener>
                  <ActivityProvider>
                    <ZhuyinProvider>
                      <Component {...pageProps} />
                    </ZhuyinProvider>
                  </ActivityProvider>
                </CoinRewardListener>
              </ThemeProvider>
            </ConversationProvider>
            </VideoCacheProvider>
            </CardAnimationProvider>
          </CardProvider>
        </CoinProvider>
      </MemoryProvider>
    </AuthProvider>
  )
}
