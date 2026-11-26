import React from 'react';
import { AuthCard } from '../../src/components/auth/AuthCard';

/** Вход и регистрация — один экран с переключателем. */
export default function LoginScreen() {
  return <AuthCard key="login" initialMode="login" />;
}
