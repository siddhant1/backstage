/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Logger } from 'winston';
import parseGitUrl from 'git-url-parse';
import { Entity } from '@backstage/catalog-model';
import {
  GitHubIntegration,
  ScmIntegrationRegistry,
} from '@backstage/integration';
import {
  AnalyzeLocationRequest,
  AnalyzeLocationResponse,
  LocationAnalyzer,
} from './types';
import { DiscoveryApi } from '@backstage/plugin-permission-common';
import { GitHubLocationAnalyzer } from './GitHubLocationAnalyzer';

export class RepoLocationAnalyzer implements LocationAnalyzer {
  private readonly logger: Logger;
  private readonly scmIntegrations: ScmIntegrationRegistry;
  private readonly discovery: DiscoveryApi;

  constructor(
    logger: Logger,
    scmIntegrations: ScmIntegrationRegistry,
    discovery: DiscoveryApi,
  ) {
    this.logger = logger;
    this.scmIntegrations = scmIntegrations;
    this.discovery = discovery;
  }
  async analyzeLocation(
    request: AnalyzeLocationRequest,
  ): Promise<AnalyzeLocationResponse> {
    const integration = this.scmIntegrations.byUrl(
      request.location.target,
    ) as GitHubIntegration;
    const { owner, name } = parseGitUrl(request.location.target);

    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: name,
      },
      spec: { type: 'other', lifecycle: 'unknown' },
    };

    let annotationPrefix;
    let analyzer;
    switch (integration?.type) {
      case 'azure':
        annotationPrefix = 'dev.azure.com';
        break;
      case 'bitbucket':
        annotationPrefix = 'bitbucket.org';
        break;
      case 'github':
        annotationPrefix = 'github.com';
        analyzer = new GitHubLocationAnalyzer({
          integration,
          discovery: this.discovery,
        });
        break;
      case 'gitlab':
        annotationPrefix = 'gitlab.com';
        break;
      default:
        break;
    }
    if (analyzer) {
      const existingEntityFiles = await analyzer.analyze(
        owner,
        name,
        request.location.target,
      );
      if (existingEntityFiles.length > 0) {
        this.logger.debug(
          `entity for ${request.location.target} already exists.`,
        );
        return {
          existingEntityFiles,
          generateEntities: [],
        };
      }
    }

    if (annotationPrefix) {
      entity.metadata.annotations = {
        [`${annotationPrefix}/project-slug`]: `${owner}/${name}`,
      };
    }

    this.logger.debug(`entity created for ${request.location.target}`);
    return {
      existingEntityFiles: [],
      generateEntities: [{ entity, fields: [] }],
    };
  }
}
