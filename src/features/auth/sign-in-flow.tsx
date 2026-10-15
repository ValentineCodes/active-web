import { createContext, useContext, useState, type ReactNode } from 'react';

type SignInFlowState = {
  completingPhoneOtp: boolean;
  setCompletingPhoneOtp: (value: boolean) => void;
};

const SignInFlowContext = createContext<SignInFlowState | null>(null);

export function SignInFlowProvider({ children }: { children: ReactNode }) {
  const [completingPhoneOtp, setCompletingPhoneOtp] = useState(false);

  return (
    <SignInFlowContext.Provider value={{ completingPhoneOtp, setCompletingPhoneOtp }}>
      {children}
    </SignInFlowContext.Provider>
  );
}

export function useSignInFlow(): SignInFlowState {
  const value = useContext(SignInFlowContext);
  if (!value) {
    throw new Error('useSignInFlow was called outside SignInFlowProvider');
  }
  return value;
}
