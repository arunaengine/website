/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2AnnouncementEvent } from './v2AnnouncementEvent';
import type { v2ResourceEvent } from './v2ResourceEvent';
import type { v2UserEvent } from './v2UserEvent';
export type v2EventMessage = {
    resourceEvent?: v2ResourceEvent;
    userEvent?: v2UserEvent;
    announcementEvent?: v2AnnouncementEvent;
};

