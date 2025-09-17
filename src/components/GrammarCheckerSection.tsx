import { Zap, CheckCircle, Users, Star } from 'lucide-react';

const features = [
  {
    icon: Zap,
    iconColor: 'text-orange-600',
    title: 'Real-time correction',
    description: 'Instant feedback as you write with advanced AI',
  },
  {
    icon: CheckCircle,
    iconColor: 'text-green-600',
    title: 'One-click fixes',
    description: 'Automatically apply grammar and spelling corrections',
  },
  {
    icon: Users,
    iconColor: 'text-red-600',
    title: 'Native-style rewrites',
    description: 'See how a native would express your idea',
  },
  {
    icon: Star,
    iconColor: 'text-yellow-600',
    title: 'Fluency focus',
    description: 'Beyond correctness: Spanish that sounds natural',
  },
];

export default function GrammarCheckerSection() {
  return (
    <section className="py-16">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Professional Spanish Grammar Checker
        </h2>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          Detect and fix grammar, spelling, punctuation, accents, and agreement in real time — with native-style suggestions to boost fluency.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, index) => (
          <div
            key={index}
            className="bg-white p-6 text-center hover:shadow-lg transition-shadow border-l-4 border-orange-200"
          >
            <div className="flex justify-center mb-3">
              <feature.icon className={`h-8 w-8 ${feature.iconColor}`} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
            <p className="text-sm text-gray-600">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}