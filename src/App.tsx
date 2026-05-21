import { useEffect, useState } from 'react';
import { AgentProvider } from './contexts/AgentContext.js';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import { ToastProvider } from './contexts/ToastContext.js';
import { ChatProvider } from './contexts/ChatContext.js';
import Sidebar from './components/Layout/Sidebar.js';
import ChatPage from './components/Chat/ChatPage.js';
import TaskBoard from './components/Dashboard/TaskBoard.js';
import BudgetPanel from './components/Dashboard/BudgetPanel.js';
import IssueTracker from './components/Dashboard/IssueTracker.js';
import AuditLog from './components/Dashboard/AuditLog.js';
import OrgChart from './components/Dashboard/OrgChart.js';
import SettingsPage from './components/Settings/SettingsPage.js';
import VaultViewer from './components/Vault/VaultViewer.js';
import PipelineModal from './components/Pipeline/PipelineModal.js';
import WebViewPage from './components/WebView/WebViewPage.js';
import UsageDashboard from './components/Dashboard/UsageDashboard.js';
import ToolManager from './components/Dashboard/ToolManager.js';
import WorkflowDashboard from './components/Dashboard/WorkflowDashboard.js';
import TeamManager from './components/Dashboard/TeamManager.js';
import SchedulerDashboard from './components/Dashboard/SchedulerDashboard.js';
import OperationsCenter from './components/Dashboard/OperationsCenter.js';
import ExecutionTimeline from './components/Dashboard/ExecutionTimeline.js';
import AutomationRunner from './components/Automation/AutomationRunner.js';
import ToastContainer from './components/UI/Toast.js';
import WindowControls from './components/Layout/WindowControls.js';
import CommandPalette from './components/CommandPalette.js';
import { initProviderKeys } from './utils/providers/index.js';
import type { ViewMode } from './types/index.js';

function AppInner() {
  useAuth();
  const [view, setView] = useState<ViewMode>('chat');
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    initProviderKeys();
  }, []);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const [showPipeline, setShowPipeline] = useState(false);

  const renderMain = () => {
    switch (view) {
      case 'chat': return <ChatPage />;
      case 'tasks': return <TaskBoard />;
      case 'budget': return <BudgetPanel />;
      case 'issues': return <IssueTracker />;
      case 'audit': return <AuditLog />;
      case 'orgchart': return <OrgChart />;
      case 'vault': return <VaultViewer />;
      case 'webview': return <WebViewPage />;
      case 'usage': return <UsageDashboard />;
      case 'toolmanager': return <ToolManager />;
      case 'workflow': return <WorkflowDashboard />;
      case 'team': return <TeamManager />;
      case 'scheduler': return <SchedulerDashboard />;
      case 'operations': return <OperationsCenter />;
      case 'timeline': return <ExecutionTimeline />;
      case 'settings': return <SettingsPage />;
      default: return <ChatPage />;
    }
  };

  return (
    <div className="flex h-screen bg-chat-bg overflow-hidden">
      <Sidebar
        view={view}
        onViewChange={setView}
        onOpenPipeline={() => setShowPipeline(true)}
      />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {renderMain()}
      </main>

      {showPipeline && <PipelineModal onClose={() => setShowPipeline(false)} />}
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onViewChange={setView}
        onOpenPipeline={() => setShowPipeline(true)}
      />
      <AutomationRunner />
      <ToastContainer />
      <WindowControls />
    </div>
  );
}

export default function App() {
  return (
    <AgentProvider>
      <ToastProvider>
        <AuthProvider>
          <ChatProvider>
            <AppInner />
          </ChatProvider>
        </AuthProvider>
      </ToastProvider>
    </AgentProvider>
  );
}
