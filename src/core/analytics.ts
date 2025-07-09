import { AnalyticServices } from '../../prisma/client';
import { prisma } from '../plugins/prisma';

export default async function sendToAnalytics(
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