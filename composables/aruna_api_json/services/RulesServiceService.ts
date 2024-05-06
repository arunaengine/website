/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2CreateRuleBindingResponse } from '../models/v2CreateRuleBindingResponse';
import type { v2CreateRuleRequest } from '../models/v2CreateRuleRequest';
import type { v2CreateRuleResponse } from '../models/v2CreateRuleResponse';
import type { v2DeleteRuleBindingResponse } from '../models/v2DeleteRuleBindingResponse';
import type { v2DeleteRuleResponse } from '../models/v2DeleteRuleResponse';
import type { v2GetRuleResponse } from '../models/v2GetRuleResponse';
import type { v2ListRuleResponse } from '../models/v2ListRuleResponse';
import type { v2UpdateRuleResponse } from '../models/v2UpdateRuleResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class RulesServiceService {
    /**
     * CreateRule
     * Status: ALPHA
     *
     * Create a new rule
     * @param body
     * @returns v2CreateRuleResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static rulesServiceCreateRule(
        body: v2CreateRuleRequest,
    ): CancelablePromise<v2CreateRuleResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/rules',
            body: body,
        });
    }
    /**
     * ListRule
     * Status: ALPHA
     *
     * Lists rules -> Owned and public rules
     * @returns v2ListRuleResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static rulesServiceListRule(): CancelablePromise<v2ListRuleResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/rules/list',
        });
    }
    /**
     * GetRule
     * Status: ALPHA
     *
     * Gets an existing rule
     * @param id
     * @returns v2GetRuleResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static rulesServiceGetRule(
        id: string,
    ): CancelablePromise<v2GetRuleResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/rules/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * DeleteRule
     * Status: ALPHA
     *
     * Deletes an existing rule
     * @param id
     * @returns v2DeleteRuleResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static rulesServiceDeleteRule(
        id: string,
    ): CancelablePromise<v2DeleteRuleResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/rules/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * UpdateRule
     * Status: ALPHA
     *
     * Updates an existing rule
     * @param id
     * @param body
     * @returns v2UpdateRuleResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static rulesServiceUpdateRule(
        id: string,
        body: {
            rule?: string;
            description?: string;
            public?: boolean;
        },
    ): CancelablePromise<v2UpdateRuleResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/rules/{id}',
            path: {
                'id': id,
            },
            body: body,
        });
    }
    /**
     * CreateRuleBinding
     * Status: ALPHA
     *
     * Associates a rule with an object, optionally cascading the rule to all children
     * @param ruleId
     * @param body
     * @returns v2CreateRuleBindingResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static rulesServiceCreateRuleBinding(
        ruleId: string,
        body: {
            objectId?: string;
            cascading?: boolean;
        },
    ): CancelablePromise<v2CreateRuleBindingResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/rules/{ruleId}/bindings',
            path: {
                'ruleId': ruleId,
            },
            body: body,
        });
    }
    /**
     * DeleteRuleBinding
     * Status: ALPHA
     *
     * Disassociates a rule from an object
     * @param ruleId
     * @param objectId
     * @returns v2DeleteRuleBindingResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static rulesServiceDeleteRuleBinding(
        ruleId: string,
        objectId: string,
    ): CancelablePromise<v2DeleteRuleBindingResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/rules/{ruleId}/bindings/{objectId}',
            path: {
                'ruleId': ruleId,
                'objectId': objectId,
            },
        });
    }
}
