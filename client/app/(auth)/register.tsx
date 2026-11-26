import React from 'react';
import { AuthCard } from '../../src/components/auth/AuthCard';

/** Регистрация открывается на том же экране, сразу во вкладке «Регистрация». */
export default function RegisterScreen() {
  return <AuthCard key="register" initialMode="register" />;
}
