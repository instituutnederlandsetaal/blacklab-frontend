package nl.inl.corpuswebsite.utils;

import jakarta.servlet.http.HttpServletResponse;

/** 
 * Should never be caught, only propagated to the top level, at which point the code and body should be returned to the client.
 * Yes yes.. Exceptions as control flow is bad practice, but in this case it makes perfect sense because we never know when we need abort/return control to the client. 
 * We only use this in unrecoverable situations (blacklab returned 404, 401, that sort of thing).
 */
public class ReturnToClientException extends HttpException {
	public ReturnToClientException(int code, String message) {
		super(code, message);
	}
	
	protected ReturnToClientException(Throwable e, int code, String message) {
		super(e, code, message);
		assert !(e instanceof ReturnToClientException);
	}

	protected ReturnToClientException(Throwable e, int code) {
		super(e, code);
		assert !(e instanceof ReturnToClientException);
	}

	public static ReturnToClientException wrap(Exception cause) {
		if (cause instanceof ReturnToClientException) return (ReturnToClientException) cause;
		else if (cause instanceof HttpException) {
			HttpException other = (HttpException) cause;
			return new ReturnToClientException(other.getCause(), other.getHttpStatusCode(), other.getMessage());
		}
		return new ReturnToClientException(cause, HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
	}

	public static ReturnToClientException wrap(Exception cause, String message) {
		if (cause instanceof ReturnToClientException) {
			ReturnToClientException other = (ReturnToClientException) cause;
			return new ReturnToClientException(other.getCause(), other.getHttpStatusCode(), message + ": " + other.getMessage());
		} else if (cause instanceof HttpException) {
			HttpException other = (HttpException) cause;
			return new ReturnToClientException(other.getCause(), other.getHttpStatusCode(), message + ": " + other.getMessage());
		}
		return new ReturnToClientException(cause, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, message);
	}

	public static ReturnToClientException wrap(Exception cause, String message, int code) {
		if (cause instanceof ReturnToClientException) {
			ReturnToClientException other = (ReturnToClientException) cause;
			return new ReturnToClientException(other.getCause(), code, message + ": " + other.getMessage());
		} else if (cause instanceof HttpException) {
			HttpException other = (HttpException) cause;
			return new ReturnToClientException(other.getCause(), code, message + ": " + other.getMessage());
		}
		return new ReturnToClientException(cause, code, message);
	}
}
