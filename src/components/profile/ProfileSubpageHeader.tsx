import React from 'react';
import { ArrowLeft } from 'lucide-react';
import './profileSubpageHeader.css';

type Props = {
  onBack: () => void;
  backLabel: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  search?: React.ReactNode;
  detailsAction?: React.ReactNode;
  stickyContent?: React.ReactNode;
};

export const ProfileSubpageHeader: React.FC<Props> = ({
  onBack, backLabel, icon, title, description, action, search, detailsAction, stickyContent,
}) => (
  <div className="profile-collapse-shell">
    <div className={`profile-collapse-header${search ? ' profile-collapse-header--search' : ''}${stickyContent ? ' profile-collapse-header--storyboard' : ''}`}>
      <div className="profile-collapse-top">
        <button type="button" onClick={onBack} aria-label={backLabel} title={backLabel} className="profile-collapse-back">
          <ArrowLeft size={16} /><span>{backLabel}</span>
        </button>
        <span className="profile-collapse-icon" aria-hidden="true">{icon}</span>
        <h1 className="profile-collapse-title">{title}</h1>
        <p className="profile-collapse-description">{description}</p>
        {action ? <div className="profile-collapse-action">{action}</div> : null}
        {detailsAction ? <div className="profile-collapse-details-action">{detailsAction}</div> : null}
        {search ? <div className="profile-collapse-search">{search}</div> : null}
      </div>
      {stickyContent ? <div className="profile-collapse-sticky-content">{stickyContent}</div> : null}
    </div>
  </div>
);
