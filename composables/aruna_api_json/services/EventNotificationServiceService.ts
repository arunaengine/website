/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2AcknowledgeMessageBatchRequest } from '../models/v2AcknowledgeMessageBatchRequest';
import type { v2AcknowledgeMessageBatchResponse } from '../models/v2AcknowledgeMessageBatchResponse';
import type { v2CreateStreamConsumerRequest } from '../models/v2CreateStreamConsumerRequest';
import type { v2CreateStreamConsumerResponse } from '../models/v2CreateStreamConsumerResponse';
import type { v2DeleteStreamConsumerResponse } from '../models/v2DeleteStreamConsumerResponse';
import type { v2GetEventMessageBatchResponse } from '../models/v2GetEventMessageBatchResponse';
import type { v2GetEventMessageStreamResponse } from '../models/v2GetEventMessageStreamResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class EventNotificationServiceService {
    /**
     * AcknowledgeMessageBatch
     * Status: BETA
     *
     * List of messages to acknowledge
     * Each reply is protected by a salt and and hmac that verifies the message
     * @param body
     * @returns v2AcknowledgeMessageBatchResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static eventNotificationServiceAcknowledgeMessageBatch(
        body: v2AcknowledgeMessageBatchRequest,
    ): CancelablePromise<v2AcknowledgeMessageBatchResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/notifications/acknowledge',
            body: body,
        });
    }
    /**
     * CreateStreamConsumer
     * Status: BETA
     *
     * Creates a new event stream consumer.
     * @param body
     * @returns v2CreateStreamConsumerResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static eventNotificationServiceCreateStreamConsumer(
        body: v2CreateStreamConsumerRequest,
    ): CancelablePromise<v2CreateStreamConsumerResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/notifications/consumers',
            body: body,
        });
    }
    /**
     * DeleteEventStreamingGroup
     * Status: BETA
     *
     * Deletes an existing event stream consumer by ID.
     * @param streamConsumer
     * @returns v2DeleteStreamConsumerResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static eventNotificationServiceDeleteStreamConsumer(
        streamConsumer: string,
    ): CancelablePromise<v2DeleteStreamConsumerResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/notifications/{streamConsumer}',
            path: {
                'streamConsumer': streamConsumer,
            },
        });
    }
    /**
     * GetEventMessageBatch
     * Status: BETA
     *
     * Reads a set of messages from a given stream group
     * Each message contains a separate acknowledgement message thatis protected by a salt and an hmac for verification.
     * The message can be send directly through the AcknowledgeMessageBatch call to acknowledge the message.
     * @param streamConsumer
     * @param batchSize
     * @returns v2GetEventMessageBatchResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static eventNotificationServiceGetEventMessageBatch(
        streamConsumer: string,
        batchSize?: number,
    ): CancelablePromise<v2GetEventMessageBatchResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/notifications/{streamConsumer}/batch',
            path: {
                'streamConsumer': streamConsumer,
            },
            query: {
                'batchSize': batchSize,
            },
        });
    }
    /**
     * GetEventMessageBatch
     * Status: BETA
     *
     * Opens a stream which pushes each received notification individual and just-in-time.
     * Each message contains a separate acknowledgement message that is protected by a salt and an hmac for verification.
     * The message can be send directly through the AcknowledgeMessageBatch call to acknowledge the message.
     * @param streamConsumer
     * @returns any A successful response.(streaming responses)
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static eventNotificationServiceGetEventMessageStream(
        streamConsumer: string,
    ): CancelablePromise<{
        result?: v2GetEventMessageStreamResponse;
        error?: googlerpcStatus;
    } | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/notifications/{streamConsumer}/stream',
            path: {
                'streamConsumer': streamConsumer,
            },
        });
    }
}
