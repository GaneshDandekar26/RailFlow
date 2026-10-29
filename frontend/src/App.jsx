import { Link, Route, Routes as RouterRoutes } from 'react-router-dom';
import { Compass } from 'lucide-react';
import Layout from './components/Layout.jsx';
import EmptyState from './components/EmptyState.jsx';
import Overview from './pages/Overview.jsx';
import Trains from './pages/Trains.jsx';
import RouteManagement from './pages/Routes.jsx';
import Tracking from './pages/Tracking.jsx';
import Schedule from './pages/Schedule.jsx';
import About from './pages/About.jsx';

function NotFound() {
  return (
    <section className="card">
      <EmptyState
        icon={Compass}
        title="That page doesn't exist"
        description="The address may be mistyped, or the page may have moved."
      >
        <Link to="/" className="btn btn-primary">
          Back to overview
        </Link>
      </EmptyState>
    </section>
  );
}

export default function App() {
  return (
    <RouterRoutes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="trains" element={<Trains />} />
        <Route path="routes" element={<RouteManagement />} />
        <Route path="routes/:number" element={<RouteManagement />} />
        <Route path="tracking" element={<Tracking />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </RouterRoutes>
  );
}
