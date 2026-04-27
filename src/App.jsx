import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import LandingScreen from './screens/LandingScreen';
import FlightSetupScreen from './screens/FlightSetupScreen';
import WeatherPictureScreen from './screens/WeatherPictureScreen';
import PaveAssessmentScreen from './screens/PaveAssessmentScreen';
import ResultsScreen from './screens/ResultsScreen';
import AiChatScreen from './screens/AiChatScreen';
import AboutScreen from './screens/AboutScreen';

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/flight-setup" element={<FlightSetupScreen />} />
        <Route path="/weather-picture" element={<WeatherPictureScreen />} />
        <Route path="/pave-assessment" element={<PaveAssessmentScreen />} />
        <Route path="/results" element={<ResultsScreen />} />
        <Route path="/ai-chat" element={<AiChatScreen />} />
        <Route path="/about" element={<AboutScreen />} />
      </Route>
    </Routes>
  );
}

export default App;
