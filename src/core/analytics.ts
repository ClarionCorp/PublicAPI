import { AnalyticServices } from '../../prisma/client';
import { prisma } from '../plugins/prisma';

export async function sendToAnalytics(
  service: AnalyticServices,
  address?: string,
  uat?: number,
  notes?: string
) {
  await prisma.analytics.create({
    data: {
      service,
      address,
      uat,
      notes
    }
  })
}

export async function failedLogin(
  service: AnalyticServices,
  address?: string,
  note?: string,
  uat?: number
) {
  await prisma.loginAttempts.create({
    data: {
      service,
      address,
      note,
      uat
    }
  })
}