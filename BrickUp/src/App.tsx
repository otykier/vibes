import { HashRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import SessionPage from './pages/SessionPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:slug" element={<SessionPage />} />
      </Routes>
    </HashRouter>
  );
}
