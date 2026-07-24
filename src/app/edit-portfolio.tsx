import { useLocalSearchParams } from 'expo-router';

import { AddPortfolio } from '@/screens/add-portfolio';

export default function EditPortfolioRoute() {
  const { portfolioId } = useLocalSearchParams<{ portfolioId: string }>();
  return <AddPortfolio portfolioId={portfolioId} />;
}
